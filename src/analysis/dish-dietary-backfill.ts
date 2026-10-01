import { DISH_DIETARY_CHUNK_SIZE, type DishDietaryInput, type DishDietaryResult } from "./dish-dietary";
import type { LlmUsage } from "@/lib/job";

export const BACKFILL_CAP_USD = 15;
export const BACKFILL_MAX_IN_FLIGHT = 32;
export type BackfillBatch = { ids: number[]; reservedUsd: number; batchId?: string; costUsd?: number; usage?: LlmUsage };
export type BackfillLedger = { version: string; approval: string; batches: BackfillBatch[]; retryCycleStartBatchCount?: number; retryCandidateIds?: number[] };
export type BackfillPorts = {
  persist: (ledger: BackfillLedger) => Promise<void>;
  pending: (exclude: number[]) => Promise<DishDietaryInput[]>;
  estimate: (items: DishDietaryInput[]) => number;
  submit: (items: DishDietaryInput[]) => Promise<string>;
  collect: (batchId: string, ids: number[]) => Promise<{ results: Map<number, DishDietaryResult>; usage: LlmUsage } | null>;
  save: (results: Map<number, DishDietaryResult>) => Promise<void>;
};
export function backfillSpend(ledger: BackfillLedger) {
  return {
    actualUsd: ledger.batches.reduce((sum, batch) => sum + (batch.costUsd ?? 0), 0),
    committedUsd: ledger.batches.reduce((sum, batch) => sum + (batch.costUsd ?? batch.reservedUsd), 0),
  };
}
/** One bounded step. Persist before submission; an ambiguous submission keeps its reservation. */
export async function advanceDishDietaryBackfill(ledger: BackfillLedger, ports: BackfillPorts): Promise<"waiting" | "saved" | "submitted" | "complete" | "capped"> {
  const active = ledger.batches.filter((batch) => batch.costUsd === undefined);
  if (active.some((batch) => !batch.batchId)) throw new Error("Submission outcome unknown; recover the provider batch ID before resuming. Reservation retained.");
  // Failed or malformed Reviews remain pending, but are never silently billed again by this run.
  const excluded = ledger.batches.flatMap((batch) => batch.ids);
  let items = active.length < BACKFILL_MAX_IN_FLIGHT
    ? await ports.pending(excluded)
    : [];
  const hasPending = items.length > 0;
  const remaining = BACKFILL_CAP_USD - backfillSpend(ledger).committedUsd;
  while (items.length && ports.estimate(items) > remaining) items = items.slice(0, Math.max(0, items.length - DISH_DIETARY_CHUNK_SIZE));
  if (items.length) {
    const batch: BackfillBatch = { ids: items.map((item) => item.id), reservedUsd: ports.estimate(items) };
    ledger.batches.push(batch);
    await ports.persist(ledger);
    batch.batchId = await ports.submit(items);
    await ports.persist(ledger);
    return "submitted";
  }
  for (const batch of active) {
    const collected = await ports.collect(batch.batchId!, batch.ids);
    if (!collected) continue;
    await ports.save(collected.results);
    batch.costUsd = collected.usage.cost_usd;
    batch.usage = collected.usage;
    await ports.persist(ledger);
    return "saved";
  }
  if (active.length) return "waiting";
  return hasPending ? "capped" : "complete";
}
/** A retry cycle may attempt each previously settled Review once, even after a restart. */
export function excludedBackfillReviewIds(ledger: BackfillLedger, retryFailed: boolean): number[] {
  const allIds = [...new Set(ledger.batches.flatMap((batch) => batch.ids))];
  if (!retryFailed || ledger.retryCycleStartBatchCount === undefined) return allIds;
  const beforeRetry = new Set(ledger.retryCandidateIds ?? []);
  const attemptedInCycle = new Set(ledger.batches.slice(ledger.retryCycleStartBatchCount)
    .flatMap((batch) => batch.ids));
  const active = new Set(ledger.batches.filter((batch) => batch.costUsd === undefined)
    .flatMap((batch) => batch.ids));
  return allIds.filter((id) => !beforeRetry.has(id) || attemptedInCycle.has(id) || active.has(id));
}
