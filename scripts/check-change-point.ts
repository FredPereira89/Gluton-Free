// Read-only proposal diagnostic. Usage: npx tsx --env-file=.env.local scripts/check-change-point.ts <slug> [YYYY-MM..YYYY-MM]
import { proposeChangePoint } from "../src/lib/change-point-proposal";
import { closeDb, db } from "../src/lib/db";
import type { ChangeMarker } from "../src/domain/aspects";
import { extractSync, type ExtractInput } from "../src/analysis/extract";
import { emptyUsage, EXTRACT_MODEL } from "../src/analysis/llm";

const slug = process.argv[2];
if (!slug) throw new Error("usage: check-change-point.ts <slug>");
const diagnosticRange = process.argv[3];
const [startMonth, endMonth] = diagnosticRange?.split("..") ?? [];
if (diagnosticRange && (!startMonth || !endMonth ||
  !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth) || endMonth < startMonth)) {
  throw new Error("diagnostic range must be YYYY-MM..YYYY-MM");
}

try {
  const rows = await db()`
    select r.id, r.published_at, r.text, r.stars, a.change from review r
    join listing l on l.id = r.listing_id
    join restaurant x on x.id = l.restaurant_id
    left join review_analysis a on a.review_id = r.id
    where x.slug = ${slug}
    order by r.published_at, r.id`;
  const proposal = proposeChangePoint(rows.map((r) => ({
    publishedAt: r.published_at as Date, change: r.change as ChangeMarker | null,
  })));
  let diagnostic: object | undefined;
  if (diagnosticRange) {
    const candidates = rows.filter((r) => {
      const month = (r.published_at as Date).toISOString().slice(0, 7);
      return month >= startMonth! && month <= endMonth! && r.text;
    });
    const inputs: ExtractInput[] = candidates.map((r) => ({ id: Number(r.id), text: r.text as string, stars: r.stars as number | null }));
    const usage = emptyUsage("change-point-diagnostic", EXTRACT_MODEL, false);
    const extracted = await extractSync(inputs, usage);
    const augmented = rows.map((r) => ({
      publishedAt: r.published_at as Date,
      change: extracted.get(Number(r.id))?.change ?? r.change as ChangeMarker | null,
    }));
    diagnostic = { range: diagnosticRange, extracted: extracted.size, mentions: [...extracted.values()].filter((r) => r.change !== "none").length,
      proposal: proposeChangePoint(augmented), costUsd: usage.cost_usd };
  }
  console.log(JSON.stringify({ slug, reviews: rows.length, proposal, diagnostic }));
} finally {
  await closeDb();
}
