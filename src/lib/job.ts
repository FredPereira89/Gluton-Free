import { db } from "./db";

export type JobKind = "lookup" | "refresh" | "baseline" | "snapshot" | "listing_fetch" | "rejudge";
export const LOOKUP_STAGES = ["Listings matched", "Reviews fetched", "window extracted", "flags verified", "signals checked", "judged and explained", "notified"] as const;
export type LookupStageName = typeof LOOKUP_STAGES[number];

export type LlmUsage = {
  at: string;
  purpose: string;
  model: string;
  batch: boolean;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
};

export async function createJob(kind: JobKind, restaurantId: number, triggerRunId?: string): Promise<number> {
  const [row] = await db()`
    insert into job (kind, restaurant_id, status, trigger_run_id)
    values (${kind}, ${restaurantId}, 'running', ${triggerRunId ?? null})
    returning id`;
  return Number(row!.id);
}

export async function setStep(jobId: number, step: string, progress?: Record<string, unknown>, stage?: LookupStageName) {
  await db()`
    update job set step = ${step}, updated_at = now(),
      progress = progress || ${db().json({ ...(progress ?? {}), ...(stage ? { stage } : {}) } as never)}
    where id = ${jobId}`;
}

export async function addVendorCost(jobId: number, usd: number) {
  await db()`update job set vendor_cost_usd = vendor_cost_usd + ${usd}, updated_at = now() where id = ${jobId}`;
}

export async function addLlmUsage(jobId: number, usage: LlmUsage) {
  await db()`
    update job set llm_usage = llm_usage || ${db().json([usage] as never)}::jsonb, updated_at = now()
    where id = ${jobId}`;
}

export async function finishJob(jobId: number, error?: string) {
  await db()`
    update job set status = ${error ? "failed" : "succeeded"}, error = ${error ?? null},
      finished_at = now(), updated_at = now()
    where id = ${jobId}`;
}
