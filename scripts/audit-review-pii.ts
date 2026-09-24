// Audit a reproducible random sample of 100 stored Review texts without printing their content.
// Usage: npx tsx --env-file=.env.local scripts/audit-review-pii.ts <slug> <signoff-job-id> [--redact]
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CHUNK } from "../src/analysis/extract";
import { addUsage, emptyUsage, EXTRACT_MODEL } from "../src/analysis/llm";
import { redactNames } from "../src/ingest/scrub";
import { closeDb, db } from "../src/lib/db";
import { addLlmUsage, setStep } from "../src/lib/job";

const [slug, rawJobId] = process.argv.slice(2);
const jobId = Number(rawJobId);
const redact = process.argv[4] === "--redact";
if (!slug || !Number.isSafeInteger(jobId) || jobId <= 0 || (process.argv[4] && !redact)) {
  console.error("usage: audit-review-pii.ts <slug> <signoff-job-id> [--redact]");
  process.exit(1);
}

const Audit = z.object({
  reviews: z.array(z.object({ i: z.number().int(), personal_names: z.array(z.string()), reviewer_name: z.boolean() })),
});
const format = zodOutputFormat(Audit);
const seed = "issue29-2026-09-24";

async function main() {
  const sql = db();
  const [job] = await sql`select id from job where id = ${jobId} and restaurant_id = (select id from restaurant where slug = ${slug!})`;
  if (!job) throw new Error("sign-off job not found for Restaurant");
  const sample = await sql`
    select r.id, r.text, l.source_code
    from review r join listing l on l.id = r.listing_id
    join restaurant x on x.id = l.restaurant_id
    where x.slug = ${slug!} and r.text is not null
    order by md5(r.id::text || ${seed}) limit 100`;
  if (sample.length !== 100) throw new Error(`expected 100 texts, found ${sample.length}`);

  const client = new Anthropic({ maxRetries: 4 });
  const usage = emptyUsage("pii-audit", EXTRACT_MODEL, false);
  const findings: { reviewId: number; personalNameCount: number; reviewerName: boolean }[] = [];
  try {
    for (let offset = 0; offset < sample.length; offset += CHUNK) {
      const part = sample.slice(offset, offset + CHUNK);
      const response = await client.messages.create({
        model: EXTRACT_MODEL,
        max_tokens: 4096,
        system: "Audit stored restaurant Review text for personal names. For every input, return its i, every exact personal name visible in its text, and reviewer_name=true only if the text identifies its author by name. Include names of staff, owners and companions. Exclude dish names, Restaurant names (including O Velho Eurico), places and already-redacted [name]. Do not guess absent names. Return one entry per input.",
        messages: [{ role: "user", content: part.map((r) => `<review i="${r.id}">\n${r.text}\n</review>`).join("\n") }],
        output_config: { format: { type: format.type, schema: format.schema } },
      });
      addUsage(usage, response.usage);
      const content = response.content.find((c) => c.type === "text");
      if (!content || content.type !== "text") throw new Error("audit response has no text");
      const parsed = Audit.parse(JSON.parse(content.text));
      const byId = new Map(parsed.reviews.map((r) => [r.i, r]));
      if (byId.size !== part.length || part.some((r) => !byId.has(Number(r.id)))) {
        throw new Error("audit response missed sampled Reviews");
      }
      for (const r of part) {
        const audit = byId.get(Number(r.id))!;
        const names = audit.personal_names.filter((n) => n.length >= 2 && (r.text as string).includes(n));
        if (names.length || audit.reviewer_name) {
          findings.push({ reviewId: Number(r.id), personalNameCount: names.length, reviewerName: audit.reviewer_name });
          if (redact && names.length) {
            await sql.begin(async (tx) => {
              await tx`update review set text = ${redactNames(r.text as string, names)} where id = ${r.id}`;
              const [analysis] = await tx`select quote, quote_en from review_analysis where review_id = ${r.id}`;
              if (analysis) await tx`
                update review_analysis
                set quote = ${analysis.quote ? redactNames(analysis.quote as string, names) : null},
                    quote_en = ${analysis.quote_en ? redactNames(analysis.quote_en as string, names) : null}
                where review_id = ${r.id}`;
              const flags = await tx`select id, evidence from review_flag where review_id = ${r.id}`;
              for (const flag of flags) await tx`update review_flag set evidence = ${redactNames(flag.evidence as string, names)} where id = ${flag.id}`;
            });
          }
        }
      }
    }
  } finally {
    await addLlmUsage(jobId, usage);
  }
  const sources = Object.fromEntries([...new Set(sample.map((r) => r.source_code as string))].map((s) => [s, sample.filter((r) => r.source_code === s).length]));
  await setStep(jobId, "PII audit complete", { piiAudit: { seed, sample: sample.length, sources, findings, redacted: redact } });
  console.log(JSON.stringify({ seed, sample: sample.length, sources, findings, redacted: redact, costUsd: usage.cost_usd }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
