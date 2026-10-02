// Evidence helpers for the launch-gate checks in #105 (gates 8 and 9, issue #120).
// The Owner still makes the judgement; these only draw the sample and read the Job history.

/** First month the scheduled refresh does real work; mirrors MONTHLY_REFRESH_START in src/trigger/monthly-refresh.ts. */
export const MONTHLY_REFRESH_START = new Date("2026-11-01T00:00:00.000Z");

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws up to n items without replacement; the same seed always draws the same sample. */
export function drawVerdictSample<T>(candidates: readonly T[], n: number, seed: string): T[] {
  const pool = [...candidates];
  const random = seededRandom(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

export type GateJob = {
  id: number;
  kind: "lookup" | "refresh" | "baseline" | "snapshot";
  status: "queued" | "running" | "succeeded" | "failed";
  triggerRunId: string | null;
  createdAt: Date;
  /** For a snapshot Job: the Peer snapshot it published, from its progress. */
  snapshotId: number | null;
};

export type RefreshEvidence = {
  passed: boolean;
  reason: string;
  runs: { triggerRunId: string; refreshed: number; snapshotId: number }[];
};

/**
 * A monthly refresh counts as run unattended when one Trigger.dev run refreshed Restaurants
 * with none failing and published a Peer snapshot. A snapshot published by hand has no refresh
 * Jobs in its run, so it never counts.
 */
export function monthlyRefreshEvidence(jobs: readonly GateJob[], since: Date = MONTHLY_REFRESH_START): RefreshEvidence {
  const byRun = new Map<string, GateJob[]>();
  for (const j of jobs) {
    if (!j.triggerRunId || j.createdAt < since) continue;
    byRun.set(j.triggerRunId, [...(byRun.get(j.triggerRunId) ?? []), j]);
  }
  if (!byRun.size) return { passed: false, reason: `No monthly refresh Jobs since ${since.toISOString().slice(0, 10)}.`, runs: [] };

  const runs: RefreshEvidence["runs"] = [];
  for (const [triggerRunId, group] of byRun) {
    const refreshes = group.filter((j) => j.kind === "refresh");
    const snapshot = group.find((j) => j.kind === "snapshot" && j.status === "succeeded" && j.snapshotId !== null);
    if (refreshes.length && refreshes.every((j) => j.status === "succeeded") && snapshot) {
      runs.push({ triggerRunId, refreshed: refreshes.length, snapshotId: snapshot.snapshotId! });
    }
  }
  return runs.length
    ? { passed: true, reason: `${runs.length} refresh run(s) completed with a published Peer snapshot.`, runs }
    : { passed: false, reason: "Refresh Jobs exist, but no run refreshed cleanly and published a Peer snapshot.", runs };
}
