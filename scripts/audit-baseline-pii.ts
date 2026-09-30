// Audits a reproducible sample of 100 persisted Lisbon baseline Review texts.
// It prints and stores counts only; Review text, detected names and Review IDs are never persisted.
// Usage: npx tsx --env-file=.env.local scripts/audit-baseline-pii.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CHUNK } from "@/analysis/extract";
import { addUsage, emptyUsage, EXTRACT_MODEL } from "@/analysis/llm";
import { closeDb, db } from "@/lib/db";
import { addLlmUsage } from "@/lib/job";

const sampleSize = 100;
const seed = "lisbon-baseline-pii-2026-09";
const Audit = z.object({
  reviews: z.array(z.object({ i: z.number().int(), personal_names: z.array(z.string()), reviewer_name: z.boolean() })),
});
const format = zodOutputFormat(Audit);

async function main() {
  const sql = db();
  const sample = await sql`
    select r.id, r.text, l.source_code
    from review r
    join listing l on l.id = r.listing_id
    join restaurant x on x.id = l.restaurant_id
    where x.baseline_sampled and x.city = 'Lisbon' and r.text is not null
    order by md5(r.id::text || ${seed})
    limit ${sampleSize}`;
  if (sample.length !== sampleSize) throw new Error(`Expected ${sampleSize} baseline texts; found ${sample.length}`);

  const [job] = await sql`
    insert into job (kind, status, step, progress)
    values ('baseline', 'running', 'Auditing baseline Review PII', '{}'::jsonb)
    returning id`;
  const jobId = Number(job!.id);
  const client = new Anthropic({ maxRetries: 4 });
  const usage = emptyUsage("baseline-pii-audit", EXTRACT_MODEL, false);
  let personalNameFindings = 0;
  let reviewerNameFindings = 0;

  try {
    for (let offset = 0; offset < sample.length; offset += CHUNK) {
      const part = sample.slice(offset, offset + CHUNK);
      const response = await client.messages.create({
        model: EXTRACT_MODEL,
        max_tokens: 4096,
        system: "Audit stored restaurant Review text for personal names. For each input return its i, exact personal names visible in its text, and reviewer_name=true only if the text identifies its author by name. Include staff, owners and companions. Exclude Restaurant names, places, dish names and [name]. Do not guess absent names. Return one entry per input.",
        messages: [{ role: "user", content: part.map((review, index) => `<review i="${offset + index}">\n${review.text}\n</review>`).join("\n") }],
        output_config: { format: { type: format.type, schema: format.schema } },
      });
      addUsage(usage, response.usage);
      const content = response.content.find((item) => item.type === "text");
      if (!content || content.type !== "text") throw new Error("PII audit response has no text");
      const parsed = Audit.parse(JSON.parse(content.text));
      const byIndex = new Map(parsed.reviews.map((result) => [result.i, result]));
      if (byIndex.size !== part.length || part.some((_, index) => !byIndex.has(offset + index))) {
        throw new Error("PII audit response missed sampled Reviews");
      }
      part.forEach((review, index) => {
        const result = byIndex.get(offset + index)!;
        const namesFound = result.personal_names.filter((name) => name.length >= 2 && (review.text as string).includes(name)).length;
        personalNameFindings += namesFound;
        reviewerNameFindings += Number(result.reviewer_name);
      });
    }

    await addLlmUsage(jobId, usage);
    const sources = Object.fromEntries([...new Set(sample.map((review) => review.source_code as string))]
      .map((source) => [source, sample.filter((review) => review.source_code === source).length]));
    const result = {
      seed, sample: sample.length, sources, personalNameFindings, reviewerNameCount: reviewerNameFindings,
      findingCount: personalNameFindings + reviewerNameFindings,
      passed: reviewerNameFindings === 0, costUsd: usage.cost_usd,
    };
    await sql`update job set status = 'succeeded', step = 'Baseline PII audit complete',
      progress = ${sql.json({ piiAudit: result } as never)}, finished_at = now(), updated_at = now()
      where id = ${jobId}`;
    console.log(JSON.stringify(result));
  } catch (error) {
    await addLlmUsage(jobId, usage);
    await sql`update job set status = 'failed', step = 'Baseline PII audit failed',
      error_code = 'baseline_pii_audit_failed', error_detail = 'Baseline PII audit failed; inspect the local error output.',
      finished_at = now(), updated_at = now() where id = ${jobId}`;
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(closeDb);
