import type postgres from "postgres";
import { tasks } from "@trigger.dev/sdk";
import type { z } from "zod";
import { reproposesFormat } from "@/domain/aspects";
import { loadNewestChangePoint } from "@/verdict/issue";
import { acceptedJobResponse, type createChangePointBodySchema } from "./api-contract";
import { db } from "./db";
import { ApiError } from "./problem";

async function enqueueRejudge(tx: postgres.TransactionSql, restaurantId: number, step: string) {
  const [job] = await tx`
    insert into job (kind, restaurant_id, status, step) values ('rejudge', ${restaurantId}, 'queued', ${step}) returning id`;
  const jobId = Number(job!.id);
  let handle: { id: string };
  try {
    // Submit before commit. If enqueue fails, the transaction rolls back the Change point change too.
    handle = await tasks.trigger("owner-change-point", { restaurantId, jobId }, {
      idempotencyKey: `change-point-${jobId}`,
    });
  } catch {
    throw new ApiError(503, "job_start_failed", "Could not start the Verdict update. Try again later.");
  }
  await tx`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${jobId}`;
  return jobId;
}

/** Declares a Change point by hand (or confirms one proposed by an Owner question) and re-judges since it. */
export async function declareChangePoint(slug: string, body: z.infer<typeof createChangePointBodySchema>): Promise<Response> {
  const jobId = await db().begin(async (tx) => {
    const [restaurant] = await tx`select id from restaurant where slug = ${slug} for update`;
    if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
    const restaurantId = Number(restaurant.id);

    const [activeJob] = await tx`
      select id from job where restaurant_id = ${restaurantId} and status in ('queued', 'running')
      order by id desc limit 1`;
    if (activeJob) throw new ApiError(409, "job_in_progress", "Wait for the current job to finish before declaring a Change point");

    if (body.questionId) {
      const [question] = await tx`
        update owner_question set status = 'answered', settled_at = now()
        where id = ${body.questionId} and restaurant_id = ${restaurantId} and status = 'open'
        returning id`;
      if (!question) throw new ApiError(404, "not_found", "Owner question not found or already settled");
    }
    const provenance = body.questionId ? "proposed_confirmed" : "declared";
    await tx`
      insert into change_point (restaurant_id, kind, date, provenance)
      values (${restaurantId}, ${body.kind}, ${body.date}, ${provenance})`;
    // Re-propose the Format only if this declaration is (or remains) the governing, newest
    // Change point (ADR 0007): a backdated new_concept/moved behind a later, non-reproposing
    // point must not override the owner's confirmation, which the later point still governs.
    const governing = await loadNewestChangePoint(restaurantId, tx);
    if (governing && reproposesFormat(governing.kind)) {
      await tx`update restaurant set format_provenance = 'llm' where id = ${restaurantId}`;
    }
    return enqueueRejudge(tx, restaurantId, "Change point declared");
  });
  return acceptedJobResponse(jobId);
}

/** Deletes a Change point and re-judges, restoring the wider Review window. */
export async function deleteChangePoint(slug: string, id: number): Promise<Response> {
  const jobId = await db().begin(async (tx) => {
    const [restaurant] = await tx`select id from restaurant where slug = ${slug} for update`;
    if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
    const restaurantId = Number(restaurant.id);

    const [activeJob] = await tx`
      select id from job where restaurant_id = ${restaurantId} and status in ('queued', 'running')
      order by id desc limit 1`;
    if (activeJob) throw new ApiError(409, "job_in_progress", "Wait for the current job to finish before deleting a Change point");

    // Soft delete: a hard delete would need to null out change_point_id on past Verdict rows to
    // satisfy the FK, destroying the record ADR 0007 requires ("each Verdict row records the
    // Change point in force" when it was issued).
    const [deleted] = await tx`
      update change_point set deleted_at = now()
      where id = ${id} and restaurant_id = ${restaurantId} and deleted_at is null
      returning id`;
    if (!deleted) throw new ApiError(404, "not_found", "Change point not found");

    return enqueueRejudge(tx, restaurantId, "Change point deleted");
  });
  return acceptedJobResponse(jobId);
}
