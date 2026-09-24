// Re-extract one Restaurant's ADR 0004 Review window for extractor sign-off.
// Usage: npx tsx --env-file=.env.local scripts/extract-signoff.ts <slug>
import { extractSync, EXTRACTOR_VERSION, type ExtractInput } from "../src/analysis/extract";
import { emptyUsage, EXTRACT_MODEL } from "../src/analysis/llm";
import { saveAnalyses } from "../src/analysis/store";
import { closeDb, db } from "../src/lib/db";
import { addLlmUsage, createJob, finishJob, setStep } from "../src/lib/job";

const slug = process.argv[2];
if (!slug || process.argv.length !== 3) {
  console.error("usage: extract-signoff.ts <slug>");
  process.exit(1);
}

async function main() {
  const sql = db();
  const [restaurant] = await sql`select id from restaurant where slug = ${slug!}`;
  if (!restaurant) throw new Error(`no restaurant ${slug}`);
  const restaurantId = Number(restaurant.id);
  const window = await sql`
    with ranked as (
      select r.id, r.text, r.stars, r.published_at,
        row_number() over (partition by r.listing_id order by r.published_at desc, r.id desc) as rank
      from review r
      join listing l on l.id = r.listing_id
      where l.restaurant_id = ${restaurantId}
        and r.text is not null and r.published_at >= now() - interval '24 months'
    )
    select ranked.id, ranked.text, ranked.stars, a.extractor_version
    from ranked
    left join review_analysis a on a.review_id = ranked.id
    where ranked.rank <= 100
    order by ranked.published_at desc, ranked.id desc`;
  if (!window.length) throw new Error("no text Reviews in the Review window");

  const pending: ExtractInput[] = window
    .filter((r) => r.extractor_version !== EXTRACTOR_VERSION)
    .map((r) => ({ id: Number(r.id), text: r.text as string, stars: r.stars as number | null }));
  const jobId = await createJob("lookup", restaurantId);
  try {
    await setStep(jobId, "extractor sign-off", {
      signoff: { issue: 29, extractorVersion: EXTRACTOR_VERSION, windowTexts: window.length, pending: pending.length },
    });
    let missing = pending;
    for (let attempt = 1; attempt <= 3 && missing.length; attempt++) {
      const usage = emptyUsage(attempt === 1 ? "extract-signoff" : "extract-signoff-retry", EXTRACT_MODEL, false);
      const results = await extractSync(missing, usage);
      await addLlmUsage(jobId, usage);
      await saveAnalyses(results, new Map(missing.map((r) => [r.id, r.text])));
      missing = missing.filter((r) => !results.has(r.id));
      await setStep(jobId, "extractor sign-off", { signoff: { attempt, missing: missing.length } });
    }
    const ids = window.map((r) => Number(r.id));
    const [coverage] = await sql`
      select count(*) filter (where extractor_version = ${EXTRACTOR_VERSION})::int as extracted
      from review_analysis where review_id in ${sql(ids)}`;
    const total = window.length;
    const extracted = Number(coverage!.extracted);
    await setStep(jobId, "extractor sign-off complete", { signoff: { total, extracted, failed: total - extracted } });
    if ((total - extracted) / total >= 0.02) throw new Error(`extraction failure rate >=2% (${total - extracted}/${total})`);
    await finishJob(jobId);
    console.log(JSON.stringify({ jobId, extractorVersion: EXTRACTOR_VERSION, total, extracted, failed: total - extracted }));
  } catch (error) {
    await finishJob(jobId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
