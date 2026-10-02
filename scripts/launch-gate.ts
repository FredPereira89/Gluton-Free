import { closeDb, db } from "../src/lib/db";
import { drawVerdictSample, monthlyRefreshEvidence, MONTHLY_REFRESH_START, type GateJob } from "../src/lib/launch-gate";

const args = process.argv.slice(2);
const command = args[0];
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const USAGE = `Usage: npx tsx --env-file=.env.local scripts/launch-gate.ts <command>
  spot-check [--seed S] [--n 20]   Gate 8: draw the Verdicts for the Owner to check, from the latest Peer snapshot.
  refresh [--since YYYY-MM-DD]     Gate 9: show whether an unattended monthly refresh ran and published a snapshot.
Read-only: no vendor calls, no model calls.`;

async function spotCheck() {
  const n = Number(value("--n") ?? "20");
  const seed = value("--seed") ?? "launch-gate-8";
  if (!Number.isInteger(n) || n <= 0) throw new Error("--n must be a positive integer.");
  const sql = db();
  const [snapshot] = await sql`select id, month, published_at from peer_snapshot order by published_at desc, id desc limit 1`;
  if (!snapshot) throw new Error("No Peer snapshot has been published yet.");
  const [publish] = await sql`
    select status from job where kind = 'snapshot' and (progress->>'snapshotId')::bigint = ${snapshot.id}
    order by id desc limit 1`;
  if (publish?.status !== "succeeded") {
    throw new Error(`Peer snapshot ${snapshot.id} is not fully published (publish Job ${publish ? `is ${publish.status}` : "not found"}); wait for re-judging to finish.`);
  }
  const latest = await sql`
    select r.id as restaurant_id, r.slug, r.name, v.state, v.tier, v.confidence, v.explanation, v.peer_snapshot_id
    from restaurant r
    join lateral (
      select * from verdict where restaurant_id = r.id order by id desc limit 1
    ) v on true
    order by r.id`;
  const rows = latest.filter((row) => row.state === "verdict" && Number(row.peer_snapshot_id) === Number(snapshot.id));
  const offSnapshot = latest.filter((row) => Number(row.peer_snapshot_id) !== Number(snapshot.id)).length;
  const sample = drawVerdictSample(rows, n, seed);
  console.log(`Peer snapshot ${snapshot.id} (${new Date(snapshot.month as string).toISOString().slice(0, 10)}), ${rows.length} Verdicts with a Tier. Seed "${seed}": ${sample.length} drawn.`);
  if (offSnapshot) console.log(`Warning: ${offSnapshot} Restaurant(s) have a latest Verdict not judged against this snapshot; they are excluded.`);
  if (sample.length < n) console.log(`Only ${sample.length} eligible; fewer than the ${n} the gate needs.`);
  console.log(`Record agree / disagree + reason for each on issue #120. Gate passes at 80% agreement (${Math.ceil(sample.length * 0.8)} of ${sample.length}).
`);
  sample.forEach((row, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${row.name} — ${String(row.tier).replace("_", " ")} (${row.confidence} confidence)`);
    console.log(`    /r/${row.slug}`);
    if (row.explanation) console.log(`    ${row.explanation}`);
  });
}

async function refresh() {
  const sinceArg = value("--since");
  const since = sinceArg ? new Date(`${sinceArg}T00:00:00Z`) : MONTHLY_REFRESH_START;
  if (Number.isNaN(since.getTime())) throw new Error("--since must be YYYY-MM-DD.");
  const rows = await db()`
    select id, kind, status, trigger_run_id, created_at, (progress->>'snapshotId')::bigint as snapshot_id
    from job
    where kind in ('refresh', 'snapshot') and created_at >= ${since}
    order by id`;
  const jobs: GateJob[] = rows.map((row) => ({
    id: Number(row.id), kind: row.kind as GateJob["kind"], status: row.status as GateJob["status"],
    triggerRunId: row.trigger_run_id as string | null, createdAt: new Date(row.created_at as string),
    snapshotId: row.snapshot_id === null ? null : Number(row.snapshot_id),
  }));
  const evidence = monthlyRefreshEvidence(jobs, since);
  console.log(JSON.stringify({ since: since.toISOString().slice(0, 10), jobsSeen: jobs.length, ...evidence }, null, 2));
  if (evidence.passed) console.log("Also confirm in the Trigger.dev dashboard that each run above was schedule-triggered, in the PRODUCTION environment: a manual run leaves identical Jobs.");
  if (!evidence.passed) process.exitCode = 1;
}

if (command === "--help" || command === "-h") console.log(USAGE);
else if (command !== "spot-check" && command !== "refresh") {
  console.error(USAGE);
  process.exitCode = 2;
} else {
  try {
    await (command === "spot-check" ? spotCheck() : refresh());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
