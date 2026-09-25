// Runs a lookup in this process, without Trigger.dev.
// Usage: npx tsx --env-file=.env.local scripts/run-local.ts <slug> [ingest|extract|judge] [--sample=N] [--extract=N]
// --sample=N fetches only the newest N Reviews per Listing; --extract=N extracts only the newest N
// unanalysed text Reviews. Both are for a quick end-to-end check.
import { closeDb, db } from "../src/lib/db";
import type { LookupStage } from "../src/lib/job";
import { localSleep, runLookup } from "../src/pipeline/lookup";

const args = process.argv.slice(2);
const sampleArg = args.find((a) => a.startsWith("--sample="));
const sample = sampleArg ? Number(sampleArg.slice("--sample=".length)) : undefined;
const extractArg = args.find((a) => a.startsWith("--extract="));
const extractLimit = extractArg ? Number(extractArg.slice("--extract=".length)) : undefined;
const [slug, from] = args.filter((a) => !a.startsWith("--"));
if (!slug || (from && !["ingest", "extract", "judge"].includes(from)) || (sample !== undefined && !(sample >= 10 && sample % 10 === 0)) || (extractLimit !== undefined && !(extractLimit >= 1))) {
  console.error("usage: run-local.ts <slug> [ingest|extract|judge] [--sample=N, a multiple of 10] [--extract=N]");
  process.exit(1);
}

async function main() {
  const [r] = await db()`select id from restaurant where slug = ${slug!}`;
  if (!r) throw new Error(`no restaurant ${slug}`);
  const out = await runLookup(Number(r.id), localSleep, { from: from as LookupStage | undefined, sample, extractLimit });
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
