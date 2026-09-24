// Bring the current extractor's analysed Review pool up to the gold-set minimum.
// Re-extracts only already analysed, stored Reviews from an older extractor version;
// it does not fetch new Reviews or run the lookup pipeline.
// Run after the owner approves the extractor and its small LLM cost:
//   npx tsx --env-file=.env.local scripts/backfill-gold-set.ts
// Add --dry-run to inspect counts without spending or writing.
// Then run scripts/gold-set.ts to replace the baseline.
import { extractSync, EXTRACTOR_VERSION, type ExtractInput } from "../src/analysis/extract";
import { selectGoldSample, GOLD_SET_MIN, type GoldCandidate } from "../src/analysis/gold-set";
import { emptyUsage, EXTRACT_MODEL } from "../src/analysis/llm";
import { saveAnalyses } from "../src/analysis/store";
import { closeDb, db } from "../src/lib/db";

type CandidateRow = Omit<GoldCandidate, "reviewId"> & { reviewId: bigint | string | number; stars: number | null };

async function main() {
  const sql = db();
  const countRows = await sql<{ count: number }[]>`
    select count(*)::int as count
    from review r join review_analysis a on a.review_id = r.id
    where r.text is not null and a.extractor_version = ${EXTRACTOR_VERSION}`;
  const count = countRows[0]!.count;
  const needed = GOLD_SET_MIN - count;
  if (needed <= 0) {
    console.log(`${count} Reviews already have ${EXTRACTOR_VERSION}; no backfill needed`);
    return;
  }

  const rawRows = await sql`
    select r.id as "reviewId", l.source_code as source, coalesce(r.language, '') as language,
      r.text, r.stars
    from review r
    join listing l on l.id = r.listing_id
    join review_analysis a on a.review_id = r.id
    where r.text is not null and a.extractor_version <> ${EXTRACTOR_VERSION}
    order by l.source_code, r.language, r.published_at desc, r.id desc` as unknown as CandidateRow[];
  const rows = rawRows.map((row) => ({ ...row, reviewId: Number(row.reviewId) }));
  const selected = selectGoldSample(rows, needed);
  if (selected.length < needed) {
    throw new Error(`only ${selected.length} older-version Reviews are eligible; ${needed} needed`);
  }
  if (process.argv.includes("--dry-run")) {
    const groups = new Map<string, number>();
    for (const candidate of selected) {
      const key = `${candidate.source}/${candidate.language}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    console.log(JSON.stringify({ alreadyCurrent: count, toBackfill: needed, groups: Object.fromEntries(groups) }));
    return;
  }

  const byId = new Map(rows.map((row) => [row.reviewId, row]));
  const items: ExtractInput[] = selected.map((candidate) => {
    const row = byId.get(candidate.reviewId)!;
    return { id: row.reviewId, text: row.text, stars: row.stars };
  });
  const usage = emptyUsage("gold-set-backfill", EXTRACT_MODEL, false);
  const results = await extractSync(items, usage);
  if (results.size !== items.length) {
    throw new Error(`${items.length - results.size} Reviews did not extract; no analyses were saved. LLM cost: $${usage.cost_usd.toFixed(4)}`);
  }

  await saveAnalyses(results, new Map(items.map((item) => [item.id, item.text])));
  console.log(`backfilled ${results.size} Reviews on ${EXTRACTOR_VERSION}; LLM cost: $${usage.cost_usd.toFixed(4)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
