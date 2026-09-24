// Runs a candidate extractor over the gold set (issue #28, scripts/gold-set.ts) and reports
// where it disagrees with the frozen baseline: per-field agreement, then the differing Reviews.
//
// Model-retirement runbook: build the gold set once on the outgoing model (scripts/gold-set.ts),
// then compare the replacement against it before switching EXTRACT_MODEL for real:
//   EXTRACT_MODEL=<candidate-model-id> npx tsx --env-file=.env.local scripts/compare-extractor.ts
// A schema change (a new field, prompt, or Theme vocabulary) is compared the same way: check out
// the candidate code, then run this script unmodified against the same frozen gold set.
import { extractSync, type ExtractInput, type Extracted } from "../src/analysis/extract";
import { emptyUsage, EXTRACT_MODEL } from "../src/analysis/llm";
import { COMPARED_FIELDS, diffExtraction, summarizeAgreement, type GoldBaseline } from "../src/analysis/gold-set";
import { closeDb, db } from "../src/lib/db";

function toBaseline(e: Extracted): GoldBaseline {
  return { lang: e.lang, aspects: e.aspects, exceptional: e.exceptional, change: e.change, themes: e.themes, flags: e.flags, quote: e.quote };
}

async function main() {
  const sql = db();
  const rows = await sql`select review_id, source_code, language, text, stars, baseline, extractor_version from gold_review order by review_id`;
  if (!rows.length) throw new Error("gold_review is empty; run scripts/gold-set.ts first");

  const items: ExtractInput[] = rows.map((r) => ({ id: Number(r.review_id), text: r.text as string, stars: r.stars as number | null }));
  const baselineByReview = new Map<number, GoldBaseline>(rows.map((r) => [Number(r.review_id), r.baseline as GoldBaseline]));
  const builtOn = new Set(rows.map((r) => r.extractor_version as string));

  console.log(`comparing ${rows.length} gold Reviews (baseline built on ${[...builtOn].join(", ")}) against candidate model ${EXTRACT_MODEL}`);
  const usage = emptyUsage("gold-compare", EXTRACT_MODEL, false);
  const results = await extractSync(items, usage);

  const missing = items.filter((i) => !results.has(i.id));
  if (missing.length) console.warn(`${missing.length} Review(s) got no candidate result and were left out of the comparison`);

  const reviewDiffs = [...results.entries()].map(([reviewId, extracted]) => diffExtraction(reviewId, baselineByReview.get(reviewId)!, toBaseline(extracted)));
  const summary = summarizeAgreement(COMPARED_FIELDS, reviewDiffs, results.size);

  console.log(`usage: ${usage.requests} requests, $${usage.cost_usd.toFixed(4)}`);
  console.log("per-field agreement:");
  console.table(summary.map((s) => ({ field: s.field, agree: s.agree, total: s.total, pct: s.total ? `${((100 * s.agree) / s.total).toFixed(1)}%` : "-" })));

  const differing = reviewDiffs.filter((r) => r.diffs.length > 0);
  console.log(`${differing.length} of ${results.size} Reviews differ from the baseline on at least one field`);
  for (const r of differing) {
    console.log(`  review ${r.reviewId}: ${r.diffs.map((d) => `${d.field} ${JSON.stringify(d.baseline)} -> ${JSON.stringify(d.candidate)}`).join("; ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
