import { tasks } from "@trigger.dev/sdk";
import type postgres from "postgres";
import { z } from "zod";
import type { PreviewListing } from "@/app/api/v1/lookups/preview/preview";
import { FORMATS } from "@/domain/restaurant-facts";
import { db } from "./db";
import { acceptedJobResponse, answerListingResponseSchema, apiJsonResponse } from "./api-contract";
import { markJobStartFailed } from "./job";
import type { PipelineError } from "./pipeline-error";
import { ApiError } from "./problem";

export const formatQuestionPayloadSchema = z.strictObject({
  proposedFormat: z.enum(FORMATS),
  googleCategory: z.string().nullable(),
});

export function formatQuestionPrompt(googleCategory: string | null, proposedFormat: string): string {
  return `Google categorizes this Restaurant as ${googleCategory ?? "a different format"}; Reviews suggest ${proposedFormat.replaceAll("_", " ")}. Keep this proposed Format?`;
}

/**
 * Raises one Owner question per uncertain Source (ADR-0005: a Lookup never waits for it).
 * Returns the id of each question actually created, skipping Sources that already had one open —
 * the caller pushes for these only after its own transaction commits.
 */
export async function raiseListingQuestions(sql: postgres.TransactionSql, restaurantId: number, askLater: PreviewListing[]): Promise<number[]> {
  const bySource = new Map<string, PreviewListing[]>();
  for (const candidate of askLater) {
    const candidates = bySource.get(candidate.source) ?? [];
    candidates.push(candidate);
    bySource.set(candidate.source, candidates);
  }
  const createdIds: number[] = [];
  for (const [source, candidates] of bySource) {
    const [created] = await sql`
      insert into owner_question (restaurant_id, kind, source_code, payload)
      values (${restaurantId}, 'listing_match', ${source}, ${sql.json({ candidates } as never)})
      on conflict (restaurant_id, source_code, kind) where status = 'open' do nothing
      returning id`;
    if (created) createdIds.push(Number(created.id));
  }
  return createdIds;
}

/**
 * Raises a Format question only when Reviews clearly disagree with Google's category.
 * Returns the created question's id, or undefined when none was raised — the caller pushes only
 * after its own transaction commits.
 */
export async function raiseFormatQuestion(
  sql: postgres.TransactionSql,
  restaurantId: number,
  proposedFormat: string,
  googleCategories: string[],
): Promise<number | undefined> {
  const googleCategory = googleCategories[0];
  if (!googleCategory) return undefined;
  const payload = formatQuestionPayloadSchema.parse({ proposedFormat, googleCategory });
  const [created] = await sql`
    insert into owner_question (restaurant_id, kind, source_code, payload)
    values (${restaurantId}, 'format', 'google', ${sql.json(payload as never)})
    on conflict (restaurant_id, source_code, kind) where status = 'open' do nothing
    returning id`;
  return created ? Number(created.id) : undefined;
}

/** Raises the Owner question for a failed Lookup (ADR-0005: a Lookup never waits for it). */
export async function raiseFailedLookupQuestion(sql: postgres.Sql, restaurantId: number, jobId: number, error: PipelineError) {
  await sql`
    insert into owner_question (restaurant_id, kind, payload)
    values (${restaurantId}, 'failed_lookup', ${sql.json({ jobId, code: error.code, detail: error.detail } as never)})
    on conflict (restaurant_id) where status = 'open' and kind = 'failed_lookup' do nothing`;
}

/** Raises one Retry Source Owner question per failed Crowd Source and returns newly created IDs. */
export async function raiseSourceRetryQuestions(sql: postgres.Sql, restaurantId: number): Promise<number[]> {
  const created = await sql`
    insert into owner_question (restaurant_id, kind, source_code, payload)
    select l.restaurant_id, 'retry_source', l.source_code, '{}'::jsonb
    from listing l join source s on s.code = l.source_code
    where l.restaurant_id = ${restaurantId} and s.kind = 'crowd' and l.fetch_status = 'failed'
    on conflict (restaurant_id, source_code, kind) where status = 'open' do nothing
    returning id`;
  return created.map((question) => Number(question.id));
}

export function questionPrompt(sourceCode: string): string {
  const source = sourceCode === "tripadvisor" ? "Tripadvisor" : sourceCode;
  return `Which ${source} listing belongs to this Restaurant?`;
}

export function questionCandidates(payload: unknown): PreviewListing[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as { candidates?: unknown };
  if (Array.isArray(data.candidates)) return data.candidates as PreviewListing[];
  // Read questions created by the earlier single-candidate payload format during rollout.
  return "placeRef" in data ? [payload as PreviewListing] : [];
}

/** Keeps the proposed Format and records that the owner confirmed it. */
export async function dismissFormatQuestion(id: number): Promise<Response> {
  await db().begin(async (tx) => {
    const [question] = await tx`
      select restaurant_id, kind, status, payload from owner_question where id = ${id} for update`;
    if (!question || question.kind !== "format") throw new ApiError(404, "not_found", "Format question not found");
    if (question.status !== "open") throw new ApiError(409, "already_settled", "This Owner question was already settled");
    const payload = formatQuestionPayloadSchema.parse(question.payload);
    // Dismiss means the owner accepts the suggested Format, so later readings must preserve it.
    await tx`
      update restaurant set format = ${payload.proposedFormat}, format_provenance = 'owner'
      where id = ${question.restaurant_id}`;
    const [settled] = await tx`
      update owner_question set status = 'dismissed', settled_at = now()
      where id = ${id} and status = 'open' returning id`;
    if (!settled) throw new ApiError(409, "already_settled", "This Owner question was already settled");
  });
  return apiJsonResponse(answerListingResponseSchema, 202, { settled: true });
}

/** Answers the most recent Owner question for that Source. Settles `none` outright; `accept` fetches the Listing and re-judges. */
export async function answerListingQuestion(
  slug: string,
  source: "google" | "tripadvisor",
  answer: { answer: "accept"; placeRef: string } | { answer: "none" },
): Promise<Response> {
  const sql = db();
  const [restaurant] = await sql`select id from restaurant where slug = ${slug}`;
  if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
  const restaurantId = Number(restaurant.id);
  const [lookup] = await sql`
    select id from job
    where restaurant_id = ${restaurantId} and kind = 'lookup' and status in ('queued', 'running')
    order by id desc limit 1`;
  if (lookup) throw new ApiError(409, "lookup_in_progress", "The initial Lookup is still running. Try again after it finishes.");
  const [question] = await sql`
    select id, status, payload from owner_question
    where restaurant_id = ${restaurantId} and source_code = ${source} and kind = 'listing_match'
    order by id desc limit 1`;
  if (!question) throw new ApiError(404, "not_found", "No Owner question for that Source");
  if (question.status !== "open") throw new ApiError(409, "already_settled", "This Owner question was already settled");

  if (answer.answer === "none") {
    const [settled] = await sql`
      update owner_question set status = 'dismissed', settled_at = now()
      where id = ${question.id} and status = 'open'
      returning id`;
    if (!settled) throw new ApiError(409, "already_settled", "This Owner question was already settled");
    return Response.json(answerListingResponseSchema.parse({ settled: true }), { status: 202, headers: { "Cache-Control": "private, no-store" } });
  }

  const { listingId, fetchJobId } = await db().begin(async (tx) => {
    const [settled] = await tx`
      update owner_question set status = 'answered', settled_at = now()
      where id = ${question.id} and status = 'open'
      returning payload`;
    if (!settled) throw new ApiError(409, "already_settled", "This Owner question was already settled");
    const candidate = questionCandidates(settled.payload).find((item) => item.placeRef === answer.placeRef);
    if (!candidate) throw new ApiError(400, "invalid_request", "Choose one of the proposed Listings");
    const [listing] = await tx`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance, source_review_count)
      values (${restaurantId}, ${source}, ${candidate.placeRef}, ${candidate.url}, 'proposed_confirmed', ${candidate.reviewCount})
      returning id`;
    const [job] = await tx`
      insert into job (kind, restaurant_id, status, step) values ('listing_fetch', ${restaurantId}, 'queued', 'Listings matched') returning id`;
    return { listingId: Number(listing!.id), fetchJobId: Number(job!.id) };
  });

  try {
    const handle = await tasks.trigger("owner-listing-answer", { restaurantId, listingId, fetchJobId }, {
      idempotencyKey: `listing-answer-${fetchJobId}`,
    });
    await sql`update job set trigger_run_id = ${handle.id}, updated_at = now() where id = ${fetchJobId}`;
  } catch (error) {
    await markJobStartFailed(fetchJobId, "Could not start listing fetch");
    throw error;
  }
  return acceptedJobResponse(fetchJobId);
}
