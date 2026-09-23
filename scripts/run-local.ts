// Runs a lookup in this process, without Trigger.dev.
// Usage: npx tsx --env-file=.env.local scripts/run-local.ts <slug> [ingest|extract|judge]
import { closeDb, db } from "../src/lib/db";
import { localSleep, runLookup, type LookupStage } from "../src/pipeline/lookup";

const [slug, from] = process.argv.slice(2);
if (!slug || (from && !["ingest", "extract", "judge"].includes(from))) {
  console.error("usage: run-local.ts <slug> [ingest|extract|judge]");
  process.exit(1);
}

async function main() {
  const [r] = await db()`select id from restaurant where slug = ${slug!}`;
  if (!r) throw new Error(`no restaurant ${slug}`);
  const out = await runLookup(Number(r.id), localSleep, { from: from as LookupStage | undefined });
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
