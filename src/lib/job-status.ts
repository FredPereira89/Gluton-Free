import { db } from "./db";
import { jobResponseSchema, type JobResponse } from "./api-contract";
import { LOOKUP_STAGES } from "./job";

export async function loadJobStatus(id: number): Promise<JobResponse | null> {
  const sql = db();
  const [job] = await sql`
    select j.*, r.slug from job j join restaurant r on r.id = j.restaurant_id where j.id = ${id}`;
  if (!job) return null;
  const sources = await sql`
    select l.source_code, s.name, l.source_rating, l.source_review_count, l.source_text_count, l.fetch_status,
      (select count(*)::int from review rv where rv.listing_id = l.id) as fetched_count
    from listing l join source s on s.code = l.source_code where l.restaurant_id = ${job.restaurant_id} order by s.name`;
  const progress = (job.progress ?? {}) as Record<string, unknown>;
  const stage = typeof progress.stage === "string" ? progress.stage : job.status === "queued" ? null : "Listings matched";
  const stageIndex = stage ? LOOKUP_STAGES.findIndex((name) => name === stage) : -1;
  const estimatedMinutes = typeof progress.estimateMinutes === "number" ? progress.estimateMinutes : 5;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - (job.created_at as Date).getTime()) / 1000));
  const etaSeconds = job.status === "succeeded" || job.status === "failed" ? null : Math.max(0, estimatedMinutes * 60 - elapsedSeconds);
  const usage = Array.isArray(job.llm_usage) ? job.llm_usage as { cost_usd?: number }[] : [];
  return jobResponseSchema.parse({
    id: Number(job.id), restaurantSlug: job.slug, status: job.status, step: job.step,
    steps: LOOKUP_STAGES.map((name, index) => ({ name, status: job.status === "succeeded" || index < stageIndex ? "done" : index === stageIndex && job.status === "running" ? "running" : "pending" })),
    sources: sources.map((source) => ({
      code: source.source_code, name: source.name, stars: source.source_rating === null ? null : Number(source.source_rating),
      reviewCount: source.source_review_count, textCount: source.source_text_count,
      fetchedCount: source.fetched_count, fetchStatus: source.fetch_status,
    })),
    facts: progress, etaSeconds, vendorUsd: Number(job.vendor_cost_usd),
    llmUsd: usage.reduce((sum, entry) => sum + (Number(entry.cost_usd) || 0), 0),
    error: job.error_code ? { code: job.error_code, detail: job.error_detail } : null,
  });
}
