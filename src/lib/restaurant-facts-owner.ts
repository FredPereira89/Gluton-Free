import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  acceptedJobResponse,
  apiJsonResponse,
  restaurantFactsUpdateBodySchema,
  restaurantFactsUpdateResponseSchema,
} from "./api-contract";
import { db } from "./db";
import { ApiError } from "./problem";

type Update = z.infer<typeof restaurantFactsUpdateBodySchema>;

/** Stores owner overrides and queues a Review-only rejudge when Format changes. */
export async function updateRestaurantFacts(slug: string, update: Update): Promise<Response> {
  const jobId = await db().begin(async (tx) => {
    const [restaurant] = await tx`select id, format from restaurant where slug = ${slug} for update`;
    if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
    const restaurantId = Number(restaurant.id);
    const format = update.format;
    const priceTier = update.priceTier;
    const formatProvided = format !== undefined;
    const priceProvided = priceTier !== undefined;
    const formatChanged = format !== undefined && format !== restaurant.format;

    const [activeJob] = await tx`
      select id from job where restaurant_id = ${restaurantId} and status in ('queued', 'running')
      order by id desc limit 1`;
    if (activeJob) throw new ApiError(409, "job_in_progress", "Wait for the current job to finish before changing Restaurant details");

    if (format !== undefined && priceTier !== undefined) {
      await tx`
        update restaurant set format = ${format}, format_provenance = 'owner',
          price_tier = ${priceTier ?? null}, price_provenance = 'owner'
        where id = ${restaurantId}`;
    } else if (format !== undefined) {
      await tx`update restaurant set format = ${format}, format_provenance = 'owner' where id = ${restaurantId}`;
    } else if (priceTier !== undefined) {
      await tx`update restaurant set price_tier = ${priceTier ?? null}, price_provenance = 'owner' where id = ${restaurantId}`;
    }

    if (formatProvided) {
      await tx`
        update owner_question set status = 'answered', settled_at = now()
        where restaurant_id = ${restaurantId} and kind = 'format' and status = 'open'`;
    }
    if (!formatChanged) return null;

    const [job] = await tx`
      insert into job (kind, restaurant_id, status, step)
      values ('rejudge', ${restaurantId}, 'queued', 'Format corrected') returning id`;
    const id = Number(job!.id);
    let handle: { id: string };
    try {
      handle = await tasks.trigger("owner-format-correction", { restaurantId, jobId: id }, {
        idempotencyKey: `format-correction-${id}`,
      });
    } catch {
      throw new ApiError(503, "job_start_failed", "Could not start the Verdict update. Try again later.");
    }
    await tx`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${id}`;
    return id;
  });

  return jobId === null
    ? apiJsonResponse(restaurantFactsUpdateResponseSchema, 200, { updated: true })
    : acceptedJobResponse(jobId);
}
