import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { fakeAnthropic } from "./vendor-fakes";

vi.mock("@/analysis/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/analysis/llm")>();
  const { fakeAnthropic } = await import("./vendor-fakes");
  return { ...original, anthropic: () => fakeAnthropic };
});

let containerId: string | undefined;
let sql: postgres.Sql | undefined;
const oldUrl = process.env.SUPABASE_DB_URL;

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=pipeline-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  if (!port) throw new Error("Docker did not assign a Postgres port");
  process.env.SUPABASE_DB_URL = `postgres://postgres:pipeline-test-only@127.0.0.1:${port}/postgres`;
  sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, connect_timeout: 1 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await sql`select 1`;
      break;
    } catch {
      if (attempt === 99) throw new Error("Disposable Postgres did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
  await sql`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only') on conflict (code) do nothing`;
}, 180_000);

afterAll(async () => {
  try {
    await sql?.end();
    const { closeDb } = await import("@/lib/db");
    await closeDb();
  } finally {
    if (containerId) docker("stop", "--time", "0", containerId);
    if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = oldUrl;
  }
});

/** A tasca with `reviewCount` recent Google text Reviews; half score `hi` on food and half `lo`. */
async function seedRestaurant(slug: string, reviewCount: number, hi: number, lo: number): Promise<number> {
  const database = sql!;
  const [restaurant] = await database`
    insert into restaurant (slug, name, city, format, format_provenance) values (${slug}, ${slug}, 'Lisbon', 'tasca', 'owner') returning id`;
  const restaurantId = Number(restaurant!.id);
  const [listing] = await database`
    insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
    values (${restaurantId}, 'google', ${`place-${slug}`}, 'https://example.invalid/g', 'pasted') returning id`;
  const day = 86_400_000;
  const reviews = await database`
    insert into review ${database(Array.from({ length: reviewCount }, (_, i) => ({
      listing_id: listing!.id, source_review_id: `${slug}-${i}`, stars: 4, published_at: new Date(Date.now() - i * day), language: "en",
      text: `Invented review ${i} of ${slug}, with plenty of words about the food.`,
    })))} returning id, source_review_id`;
  await database`
    insert into review_analysis ${database(reviews.map((r) => ({
      review_id: r.id, extractor_version: "test", food: Number(String(r.source_review_id).split("-").pop()) % 2 === 0 ? hi : lo, exceptional: "none",
    })))}`;
  return restaurantId;
}

const verdictsOf = (restaurantId: number) => sql!`
  select id, tier, state, provisional, peer_snapshot_id, job_id, explanation, inputs_hash, blocks
  from verdict where restaurant_id = ${restaurantId} order by id`;

describe("Peer snapshot publish", () => {
  // The tests build on each other: the first publishes the first snapshot over the seeded Restaurants.
  let peerIds: number[] = [];
  let thinId = 0;

  it("publishes a snapshot, re-judges every Restaurant against it and appends Verdicts naming it", async () => {
    const database = sql!;
    // 32 Peers: enough (30) for the Tasca group to be ranked against instead of judged provisionally.
    const scores: [number, number][] = [[2, 2], [2, 1], [1, 1], [1, 0], [0, 0], [0, -1], [-1, -1], [-1, -2]];
    const peers: number[] = [];
    for (let i = 0; i < 32; i++) peers.push(await seedRestaurant(`tasca-${i}`, 16, ...scores[i % scores.length]!));
    const thin = await seedRestaurant("new-kettle", 3, 1, 1);
    peerIds = peers;
    thinId = thin;
    const { issueVerdict } = await import("@/verdict/issue");
    const { emptyUsage, JUDGE_MODEL } = await import("@/analysis/llm");
    for (const id of [...peers, thin]) await issueVerdict(id, null, emptyUsage("explain", JUDGE_MODEL, false), "automatic");
    expect((await verdictsOf(peers[0]!))[0]).toMatchObject({ provisional: true, peer_snapshot_id: null });

    const { runPeerSnapshotPublish } = await import("./snapshot-publish");
    const result = await runPeerSnapshotPublish();

    const [snapshot] = await database`select id, to_char(month, 'YYYY-MM') as month from peer_snapshot order by id desc limit 1`;
    const members = await database`select restaurant_id from peer_snapshot_member where snapshot_id = ${snapshot!.id}`;
    expect(members.map((m) => Number(m.restaurant_id)).sort()).toEqual([...peers].sort());
    expect(result.snapshotId).toBe(Number(snapshot!.id));

    for (const id of [...peers, thin]) {
      const verdicts = await verdictsOf(id);
      expect(verdicts).toHaveLength(2); // the lookup's Verdict is kept; the re-judge appends
      expect(verdicts[1]).toMatchObject({ peer_snapshot_id: String(snapshot!.id), job_id: String(result.jobId) });
      expect((verdicts[1]!.blocks as { rollup: { peerSnapshot: { id: number; month: string } } }).rollup.peerSnapshot)
        .toMatchObject({ id: Number(snapshot!.id), month: snapshot!.month });
    }
    expect((await verdictsOf(thin))[1]).toMatchObject({ state: "not_enough_evidence" });
    expect((await verdictsOf(peers[0]!))[1]).toMatchObject({ state: "verdict", provisional: false });

    const [job] = await database`select kind, status, restaurant_id, vendor_cost_usd, llm_usage, progress from job where id = ${result.jobId}`;
    const usage = job!.llm_usage as { purpose: string; cost_usd: number }[];
    expect(job).toMatchObject({ kind: "snapshot", status: "succeeded", restaurant_id: null });
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every((u) => u.purpose === "explain")).toBe(true);
    expect(usage.reduce((sum, u) => sum + u.cost_usd, 0)).toBeGreaterThan(0);
    expect(job!.progress).toMatchObject({ snapshotId: Number(snapshot!.id), rejudged: 33, rewritten: 33, copied: 0 });
  }, 60_000);

  it("copies explanations forward, with no LLM call, when a later snapshot leaves their inputs unchanged", async () => {
    const database = sql!;
    const before = await Promise.all([...peerIds, thinId].map(verdictsOf));
    const parse = vi.spyOn(fakeAnthropic.messages, "parse");

    const { runPeerSnapshotPublish } = await import("./snapshot-publish");
    const result = await runPeerSnapshotPublish();

    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    const [snapshot] = await database`select id from peer_snapshot order by id desc limit 1`;
    expect(Number(snapshot!.id)).toBe(2);
    const after = await Promise.all([...peerIds, thinId].map(verdictsOf));
    after.forEach((verdicts, i) => {
      expect(verdicts).toHaveLength(before[i]!.length + 1);
      const previous = before[i]!.at(-1)!;
      expect(verdicts.at(-1)).toMatchObject({
        peer_snapshot_id: String(snapshot!.id), explanation: previous.explanation, inputs_hash: previous.inputs_hash,
      });
    });
    const [job] = await database`select status, llm_usage, progress from job where id = ${result.jobId}`;
    expect(job).toMatchObject({ status: "succeeded", llm_usage: [] });
    expect(job!.progress).toMatchObject({ rejudged: 33, rewritten: 0, copied: 33 });
  }, 60_000);

  it("applies Tier stability: a re-judge that barely crosses a boundary holds the previous Tier", async () => {
    const database = sql!;
    const id = peerIds[0]!;
    const [latest] = (await verdictsOf(id)).slice(-1);
    const rollup = (latest!.blocks as { rollup: { tier: string; compositeStanding: { percentile: number } } }).rollup;
    // Pretend the previous Verdict issued a different Tier from a composite 1 point below today's: a move that
    // small never crosses a boundary by the required 2 points.
    const issued = rollup.tier === "ok" ? "good" : "ok";
    const tampered = { ...(latest!.blocks as object), rollup: { ...rollup, tier: issued, tierBasis: { composite: rollup.compositeStanding.percentile - 1, standings: [] } } };
    await database`update verdict set blocks = ${database.json(tampered as never)}, tier = ${issued} where id = ${latest!.id}`;

    const { runPeerSnapshotPublish } = await import("./snapshot-publish");
    await runPeerSnapshotPublish();

    const [held] = (await verdictsOf(id)).slice(-1);
    expect(held).toMatchObject({ tier: issued });
    expect((held!.blocks as { rollup: { tierHeld?: boolean } }).rollup.tierHeld).toBe(true);
  }, 60_000);

  it("judges a Restaurant looked up after a snapshot against it, and admits it to the Peers at the next one", async () => {
    const database = sql!;
    const late = await seedRestaurant("late-joiner", 16, 1, 0);
    const { issueVerdict } = await import("@/verdict/issue");
    const { emptyUsage, JUDGE_MODEL } = await import("@/analysis/llm");
    const [current] = await database`select id from peer_snapshot order by id desc limit 1`;

    await issueVerdict(late, null, emptyUsage("explain", JUDGE_MODEL, false), "automatic");
    expect((await verdictsOf(late))[0]).toMatchObject({ peer_snapshot_id: String(current!.id), provisional: false });
    expect(await database`select 1 from peer_snapshot_member where snapshot_id = ${current!.id} and restaurant_id = ${late}`).toHaveLength(0);

    const { runPeerSnapshotPublish } = await import("./snapshot-publish");
    const result = await runPeerSnapshotPublish();
    expect(await database`select 1 from peer_snapshot_member where snapshot_id = ${result.snapshotId} and restaurant_id = ${late}`).toHaveLength(1);
    expect((await verdictsOf(late)).at(-1)).toMatchObject({ peer_snapshot_id: String(result.snapshotId) });
  }, 60_000);
});
