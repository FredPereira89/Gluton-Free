// Run the candidate extractor against one archival month without adding those Reviews to the Verdict window.
// Usage: npx tsx --env-file=.env.local scripts/diagnose-change-month.ts <slug> <YYYY-MM> <signoff-job-id>
import { extractSync, type ExtractInput } from "../src/analysis/extract";
import { emptyUsage, EXTRACT_MODEL } from "../src/analysis/llm";
import { closeDb, db } from "../src/lib/db";
import { addLlmUsage, setStep } from "../src/lib/job";

const [slug, month, rawJobId] = process.argv.slice(2);
const jobId = Number(rawJobId);
if (!slug || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") || !Number.isSafeInteger(jobId) || jobId <= 0) {
  console.error("usage: diagnose-change-month.ts <slug> <YYYY-MM> <signoff-job-id>");
  process.exit(1);
}

async function main() {
  const sql = db();
  const [job] = await sql`select id from job where id = ${jobId} and restaurant_id = (select id from restaurant where slug = ${slug!})`;
  if (!job) throw new Error("sign-off job not found for Restaurant");
  const start = `${month}-01`;
  const rows = await sql`
    select r.id, r.text, r.stars, l.source_code, r.published_at
    from review r join listing l on l.id = r.listing_id join restaurant x on x.id = l.restaurant_id
    where x.slug = ${slug!} and r.text is not null
      and r.published_at >= ${start}::date and r.published_at < (${start}::date + interval '1 month')
    order by r.published_at, r.id`;
  if (!rows.length) throw new Error(`no text Reviews in ${month}`);
  const items: ExtractInput[] = rows.map((r) => ({ id: Number(r.id), text: r.text as string, stars: r.stars as number | null }));
  const usage = emptyUsage("change-diagnostic", EXTRACT_MODEL, false);
  const results = await extractSync(items, usage);
  await addLlmUsage(jobId, usage);
  const markers = rows.flatMap((r) => {
    const change = results.get(Number(r.id))?.change;
    return change && change !== "none"
      ? [{ reviewId: Number(r.id), source: r.source_code, publishedAt: r.published_at, change }]
      : [];
  });
  const summary = { month, total: rows.length, extracted: results.size, markers };
  await setStep(jobId, "change-month diagnostic complete", { changeDiagnostic: summary });
  console.log(JSON.stringify({ ...summary, costUsd: usage.cost_usd }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
