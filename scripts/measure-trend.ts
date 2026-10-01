// Prints the spread of Trend slopes across the latest Verdicts, to set the Improving/Slipping cut-off
// from real data (issue #113). Read-only.
// Usage: npx tsx --env-file=.env.local scripts/measure-trend.ts
import { closeDb, db } from "../src/lib/db";
import { trendOf, trendSlope, TREND_PARAMS } from "../src/verdict/trend";

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;

async function main() {
  const now = new Date();
  const rows = await db()`
    select r.slug, v.state, v.confidence, v.provisional, v.blocks->'rollup'->'series' as series
    from restaurant r
    join lateral (select state, confidence, provisional, blocks from verdict where restaurant_id = r.id order by id desc limit 1) v on true
    where r.status <> 'permanently_closed'`;
  const slopes: number[] = [];
  const counts = { restaurants: rows.length, verdicts: 0, lowConfidence: 0, noReadableYear: 0, improving: 0, steady: 0, slipping: 0 };
  for (const row of rows) {
    if (row.state !== "verdict") continue;
    counts.verdicts += 1;
    const series = Array.isArray(row.series) ? row.series : [];
    const slope = trendSlope(series, now);
    if (slope === null) { counts.noReadableYear += 1; continue; }
    slopes.push(slope);
    if (row.confidence === "low" || row.confidence === null) { counts.lowConfidence += 1; continue; }
    counts[trendOf(series, row.confidence, now) ?? "steady"] += 1;
  }
  slopes.sort((a, b) => a - b);
  console.log(`cut-off ±${TREND_PARAMS.slopeCut} percentile points per year`);
  console.log(counts);
  console.log(`readable slopes: ${slopes.length}`);
  if (slopes.length) {
    for (const p of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) console.log(`p${Math.round(p * 100)}`.padEnd(5), quantile(slopes, p).toFixed(1));
    const mean = slopes.reduce((s, x) => s + x, 0) / slopes.length;
    const sd = Math.sqrt(slopes.reduce((s, x) => s + (x - mean) ** 2, 0) / slopes.length);
    console.log("mean", mean.toFixed(1), "sd", sd.toFixed(1));
    for (const cut of [5, 8, 10, 12, 15, 20, 25]) {
      console.log(`cut ±${cut}: improving ${slopes.filter((s) => s >= cut).length}, slipping ${slopes.filter((s) => s <= -cut).length}, steady ${slopes.filter((s) => Math.abs(s) < cut).length}`);
    }
  }
}

main().finally(closeDb);
