// Builds the extractor's gold set (issue #28): a stratified ~200-300 scrubbed text Review sample,
// stored in gold_review with the current extractor's own output, ready for
// scripts/compare-extractor.ts to check a candidate model or schema against later.
//
// Run once to build the set, and again to refresh it (e.g. once more Restaurants have widened
// language/Source coverage) — each run replaces the previous selection outright:
//   npx tsx --env-file=.env.local scripts/gold-set.ts [max]
//
// Model-retirement runbook: build (or refresh) the gold set on the outgoing model, then see
// scripts/compare-extractor.ts for how to check the replacement against it before switching.
import type { Aspect, ChangeMarker, FlagType } from "../src/domain/aspects";
import type { ThemeCode } from "../src/domain/themes";
import { EXTRACTOR_VERSION } from "../src/analysis/extract";
import { GOLD_SET_MAX, GOLD_SET_MIN, selectGoldSample, type GoldBaseline, type GoldCandidate } from "../src/analysis/gold-set";
import { closeDb, db } from "../src/lib/db";

const max = Number(process.argv[2] ?? GOLD_SET_MAX);

type AnalysisRow = {
  review_id: bigint | number;
  source_code: string;
  language: string | null;
  text: string;
  stars: number | null;
  food: number | null;
  service: number | null;
  ambience: number | null;
  value: number | null;
  wait: number | null;
  consistency: number | null;
  exceptional: string;
  change: string;
  themes: string[];
  quote: string | null;
  quote_aspect: string | null;
  quote_polarity: number | null;
};

async function main() {
  const sql = db();
  const rows = (await sql`
    select r.id as review_id, l.source_code, r.language, r.text, r.stars,
      a.food, a.service, a.ambience, a.value, a.wait, a.consistency,
      a.exceptional, a.change, a.themes, a.quote, a.quote_aspect, a.quote_polarity
    from review r
    join listing l on l.id = r.listing_id
    join review_analysis a on a.review_id = r.id and a.extractor_version = ${EXTRACTOR_VERSION}
    where r.text is not null
    order by r.id`) as unknown as AnalysisRow[];

  const flagRows = await sql`
    select f.review_id, f.type, f.first_hand, f.severity, f.evidence
    from review_flag f
    join review_analysis a on a.review_id = f.review_id and a.extractor_version = ${EXTRACTOR_VERSION}`;
  const flagsByReview = new Map<number, GoldBaseline["flags"]>();
  for (const f of flagRows) {
    const id = Number(f.review_id);
    const list = flagsByReview.get(id) ?? [];
    list.push({ type: f.type as FlagType, firstHand: f.first_hand as boolean, severity: f.severity as "low" | "medium" | "high", evidence: f.evidence as string });
    flagsByReview.set(id, list);
  }

  const candidates: GoldCandidate[] = [];
  const baselineByReview = new Map<number, GoldBaseline>();
  const rowByReview = new Map<number, AnalysisRow>();
  for (const r of rows) {
    const reviewId = Number(r.review_id);
    const language = r.language ?? "";
    candidates.push({ reviewId, source: r.source_code, language, text: r.text });
    rowByReview.set(reviewId, r);
    baselineByReview.set(reviewId, {
      lang: language,
      aspects: { food: r.food, service: r.service, ambience: r.ambience, value: r.value, wait: r.wait, consistency: r.consistency },
      exceptional: r.exceptional as GoldBaseline["exceptional"],
      change: r.change as ChangeMarker,
      themes: r.themes as ThemeCode[],
      quote: r.quote ? { text: r.quote, aspect: r.quote_aspect as Aspect, polarity: r.quote_polarity as 1 | -1 } : null,
      flags: flagsByReview.get(reviewId) ?? [],
    });
  }

  const selected = selectGoldSample(candidates, max);
  if (selected.length < GOLD_SET_MIN) {
    throw new Error(
      `only ${selected.length} candidates available; below the ${GOLD_SET_MIN} floor, so gold_review was left untouched. Run more lookups and refresh later.`,
    );
  }

  await sql.begin(async (tx) => {
    await tx`delete from gold_review`;
    for (const c of selected) {
      const row = rowByReview.get(c.reviewId)!;
      await tx`
        insert into gold_review (review_id, source_code, language, text, stars, extractor_version, baseline)
        values (${c.reviewId}, ${c.source}, ${c.language}, ${c.text}, ${row.stars}, ${EXTRACTOR_VERSION}, ${tx.json(baselineByReview.get(c.reviewId)! as never)})`;
    }
  });

  const bySourceLang = new Map<string, number>();
  for (const c of selected) {
    const key = `${c.source}/${c.language}`;
    bySourceLang.set(key, (bySourceLang.get(key) ?? 0) + 1);
  }
  console.log(`gold set: ${selected.length} of ${candidates.length} candidates, extractor ${EXTRACTOR_VERSION}`);
  console.table([...bySourceLang.entries()].map(([group, count]) => ({ group, count })));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
