import { describe, expect, it, vi } from "vitest";
import { advanceDishDietaryBackfill, backfillSpend, excludedBackfillReviewIds, type BackfillLedger, type BackfillPorts } from "./dish-dietary-backfill";
import { emptyUsage, EXTRACT_MODEL } from "./llm";
const ledger = (): BackfillLedger => ({ version: "test", approval: "owner-comment", batches: [] });
const ports = (): BackfillPorts => ({ persist: vi.fn(async () => {}), pending: vi.fn(async (exclude) => exclude.includes(1) ? [] : [{ id: 1, text: "Lovely" }]), estimate: () => 1, submit: vi.fn(async () => "batch-1"), collect: vi.fn(async () => null), save: vi.fn(async () => {}) });
describe("dish/dietary backfill", () => {
  it("reserves durably before sending and resumes the existing batch without resubmission", async () => {
    const state = ledger(), io = ports();
    io.submit = vi.fn(async () => { expect(state.batches[0]?.reservedUsd).toBe(1); expect(io.persist).toHaveBeenCalled(); return "batch-1"; });
    expect(await advanceDishDietaryBackfill(state, io)).toBe("submitted");
    expect(await advanceDishDietaryBackfill(JSON.parse(JSON.stringify(state)), io)).toBe("waiting");
    expect(io.submit).toHaveBeenCalledTimes(1);
  });
  it("never submits beyond the cumulative $15 cap", async () => {
    const state = ledger(), io = ports();
    state.batches.push({ ids: [2], reservedUsd: 14.5, costUsd: 14.5 });
    expect(await advanceDishDietaryBackfill(state, io)).toBe("capped");
    expect(io.submit).not.toHaveBeenCalled();
  });
  it("retains a reservation after an ambiguous provider failure", async () => {
    const state = ledger(), io = ports(); io.submit = vi.fn(async () => { throw new Error("network"); });
    await expect(advanceDishDietaryBackfill(state, io)).rejects.toThrow("network");
    await expect(advanceDishDietaryBackfill(state, io)).rejects.toThrow("outcome unknown");
    expect(backfillSpend(state)).toEqual({ actualUsd: 0, committedUsd: 1 });
    expect(io.submit).toHaveBeenCalledTimes(1);
  });
  it("stores results before settling measured cost and excludes attempted Reviews", async () => {
    const state = ledger(), io = ports(); await advanceDishDietaryBackfill(state, io);
    const usage = emptyUsage("backfill", EXTRACT_MODEL, true); usage.cost_usd = 0.25;
    io.collect = vi.fn(async () => ({ results: new Map(), usage }));
    expect(await advanceDishDietaryBackfill(state, io)).toBe("saved");
    expect(io.save).toHaveBeenCalled(); expect(backfillSpend(state).actualUsd).toBe(0.25);
    io.pending = vi.fn(async (exclude) => { expect(exclude).toEqual([1]); return []; });
    expect(await advanceDishDietaryBackfill(state, io)).toBe("complete");
  });

  it("submits distinct batches while earlier batches process, then settles each", async () => {
    const state = ledger(), io = ports();
    io.pending = vi.fn(async (exclude) => [1, 2].filter((id) => !exclude.includes(id)).slice(0, 1).map((id) => ({ id, text: "Lovely" })));
    io.submit = vi.fn(async (items) => `batch-${items[0]!.id}`);
    expect(await advanceDishDietaryBackfill(state, io)).toBe("submitted");
    expect(await advanceDishDietaryBackfill(state, io)).toBe("submitted");
    expect(state.batches.map((batch) => batch.ids)).toEqual([[1], [2]]);
    expect(backfillSpend(state).committedUsd).toBe(2);
    expect(await advanceDishDietaryBackfill(state, io)).toBe("waiting");
    const usage = emptyUsage("backfill", EXTRACT_MODEL, true); usage.cost_usd = 0.2;
    io.collect = vi.fn(async () => ({ results: new Map(), usage }));
    expect(await advanceDishDietaryBackfill(state, io)).toBe("saved");
    expect(backfillSpend(state).committedUsd).toBe(1.2);
    expect(await advanceDishDietaryBackfill(state, io)).toBe("saved");
    expect(await advanceDishDietaryBackfill(state, io)).toBe("complete");
  });

  it("counts all in-flight reservations against the $15 cap", async () => {
    const state = ledger(), io = ports();
    state.batches.push({ ids: [2], reservedUsd: 14.5, batchId: "batch-2" });
    expect(await advanceDishDietaryBackfill(state, io)).toBe("waiting");
    expect(io.submit).not.toHaveBeenCalled();
    const usage = emptyUsage("backfill", EXTRACT_MODEL, true); usage.cost_usd = 1;
    io.collect = vi.fn(async () => ({ results: new Map(), usage }));
    expect(await advanceDishDietaryBackfill(state, io)).toBe("saved");
    expect(await advanceDishDietaryBackfill(state, io)).toBe("submitted");
  });
  it("keeps a failed retry excluded after restarting the same retry cycle", () => {
    const state = ledger();
    state.batches.push({ ids: [1], reservedUsd: 1, costUsd: 0.2 });
    state.retryCycleStartBatchCount = state.batches.length;
    state.retryCandidateIds = [1];
    expect(excludedBackfillReviewIds(state, true)).toEqual([]);
    state.batches.push({ ids: [1], reservedUsd: 1, costUsd: 0.2 });
    const restarted = JSON.parse(JSON.stringify(state)) as BackfillLedger;
    expect(excludedBackfillReviewIds(restarted, true)).toEqual([1]);
    expect(excludedBackfillReviewIds(restarted, false)).toEqual([1]);
  });
  it("does not retry an old in-flight batch that fails after the cycle starts", () => {
    const state = ledger();
    state.batches.push({ ids: [1], reservedUsd: 1, batchId: "old" });
    state.retryCycleStartBatchCount = state.batches.length;
    state.retryCandidateIds = [];
    state.batches[0]!.costUsd = 0.2;
    expect(excludedBackfillReviewIds(state, true)).toEqual([1]);
  });
});
