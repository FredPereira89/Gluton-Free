import { createHash } from "node:crypto";
import type { Aspect, FlagType } from "@/domain/aspects";
import { db } from "@/lib/db";
import type { LlmUsage } from "@/lib/job";
import { BlocksSchema } from "./blocks";
import { explainAndQuote, preselect, type QuoteCandidate } from "./explain";
import { rollup, type RollupFlag, type RollupReview } from "./rollup";
import { loadCurrentPeerSnapshot } from "./snapshot-store";
import { stabilizeTier, type RejudgeCause } from "./stability";

const FORMAT_NAME: Record<string, string> = { tasca: "tasca" };

// changePointAt is null until #58 (Declare and delete Change points) adds storage for it.
export async function loadRollupInput(restaurantId: number, now = new Date(), changePointAt: Date | null = null) {
  const sql = db();
  const [restaurant] = await sql`select id, name, city, format from restaurant where id = ${restaurantId}`;
  if (!restaurant) throw new Error(`restaurant ${restaurantId} not found`);
  const sourceRows = await sql`
    select l.source_code, l.fetch_status from listing l join source s on s.code = l.source_code
    where l.restaurant_id = ${restaurantId} and s.kind = 'crowd'`;
  const rows = await sql`
    select r.id, l.source_code, r.published_at, r.stars, r.text is not null as has_text, r.sub_ratings,
           a.food, a.service, a.ambience, a.value, a.wait, a.consistency, a.exceptional, a.themes,
           a.review_id is not null as analysed
    from review r
    join listing l on l.id = r.listing_id
    left join review_analysis a on a.review_id = r.id
    where l.restaurant_id = ${restaurantId}`;
  const reviews: RollupReview[] = rows.map((r) => ({
    id: Number(r.id),
    source: r.source_code as string,
    publishedAt: r.published_at as Date,
    stars: r.stars as number | null,
    hasText: r.has_text as boolean,
    subRatings: (r.sub_ratings ?? null) as Partial<Record<Aspect, number>> | null,
    aspects: r.analysed
      ? { food: r.food, service: r.service, ambience: r.ambience, value: r.value, wait: r.wait, consistency: r.consistency }
      : null,
    exceptional: (r.exceptional ?? null) as RollupReview["exceptional"],
    themes: (r.themes ?? []) as string[],
  }));
  const flagRows = await sql`
    select f.review_id, f.type, f.flag_group, f.first_hand, f.verification, f.evidence, r.published_at, l.source_code
    from review_flag f
    join review r on r.id = f.review_id
    join listing l on l.id = r.listing_id
    where l.restaurant_id = ${restaurantId}`;
  const flags: RollupFlag[] = flagRows.map((f) => ({
    reviewId: Number(f.review_id),
    type: f.type as FlagType,
    group: f.flag_group as "health" | "money",
    firstHand: f.first_hand as boolean,
    verification: f.verification as RollupFlag["verification"],
    publishedAt: f.published_at as Date,
    evidence: f.evidence as string,
    source: f.source_code as string,
  }));
  return { restaurant, input: {
    now, city: restaurant.city as string, format: restaurant.format as string,
    reviews, sourceCodes: sourceRows.map((row) => row.source_code as string), flags, changePointAt,
    failedSourceCodes: sourceRows.filter((row) => row.fetch_status === "failed").map((row) => row.source_code as string),
  } };
}

async function quoteCandidates(restaurantId: number): Promise<QuoteCandidate[]> {
  const rows = await db()`
    select a.review_id, a.quote, a.quote_aspect, a.quote_polarity, a.quote_en, r.language, r.stars, l.source_code, r.published_at
    from review_analysis a
    join review r on r.id = a.review_id
    join listing l on l.id = r.listing_id
    where l.restaurant_id = ${restaurantId} and a.quote is not null
      and r.published_at > now() - interval '24 months'`;
  return rows.map((q) => ({
    reviewId: Number(q.review_id),
    aspect: q.quote_aspect as Aspect,
    polarity: q.quote_polarity as 1 | -1,
    text: q.quote as string,
    textEn: q.quote_en as string | null,
    lang: q.language as string | null,
    stars: q.stars as number | null,
    source: q.source_code as string,
    publishedAt: q.published_at as Date,
  }));
}

/** Computes and appends a Verdict. Format, Listing, Change point and undo answers use owner_answer. */
export async function issueVerdict(restaurantId: number, jobId: number | null, usage: LlmUsage, cause: RejudgeCause): Promise<number> {
  const sql = db();
  const { restaurant, input } = await loadRollupInput(restaurantId);
  const [previous] = await sql`
    select blocks, explanation, inputs_hash from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
  const priorBlocks = previous ? BlocksSchema.parse(previous.blocks) : null;
  const priorRollup = priorBlocks?.rollup ?? null;
  const r = stabilizeTier(rollup({ ...input, peerSnapshot: await loadCurrentPeerSnapshot() }), priorRollup, cause, input.now);
  const inputsHash = createHash("sha256").update(JSON.stringify({
    ruleVersion: r.ruleVersion,
    name: restaurant.name,
    format: input.format,
    now: input.now.toISOString().slice(0, 10),
    reviews: [...input.reviews].sort((a, b) => a.id - b.id),
    flags: [...input.flags].sort((a, b) => a.reviewId - b.reviewId || a.type.localeCompare(b.type)),
    sourceCodes: [...(input.sourceCodes ?? [])].sort(),
    failedSourceCodes: [...(input.failedSourceCodes ?? [])].sort(),
    changePointAt: input.changePointAt,
    peerSnapshotId: r.peerSnapshot?.id ?? null,
    state: r.state,
    tier: r.tier,
    tierHeld: r.tierHeld ?? false,
    floorCap: r.floorCap,
  })).digest("hex");

  const { explanation, quotes } = previous?.inputs_hash === inputsHash && typeof previous.explanation === "string" && priorBlocks
    ? { explanation: previous.explanation as string, quotes: priorBlocks.quotes }
    : await explainAndQuote(
      { name: restaurant.name as string, formatName: FORMAT_NAME[input.format] ?? input.format, rollup: r, candidates: preselect(await quoteCandidates(restaurantId)) },
      usage,
    );
  for (const q of quotes) {
    if (q.textEn) await sql`update review_analysis set quote_en = ${q.textEn} where review_id = ${q.reviewId} and quote_en is null`;
  }

  const blocks = BlocksSchema.parse({ rollup: r, quotes });
  const [row] = await sql`
    insert into verdict (restaurant_id, job_id, peer_snapshot_id, state, tier, confidence, provisional, blocks, explanation, inputs_hash)
    values (${restaurantId}, ${jobId}, ${r.peerSnapshot?.id ?? null}, ${r.state}, ${r.tier}, ${r.state === "verdict" ? r.confidence.level : null},
            ${r.provisional}, ${sql.json(blocks as never)}, ${explanation}, ${inputsHash})
    returning id`;
  return Number(row!.id);
}
