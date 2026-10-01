import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { APIFY_CATALOGUE_MAX_ITEMS, apifyConfigured, sweepTheForkCatalogue, type TheForkSearchItem } from "../src/ingest/apify";
import { closeDb } from "../src/lib/db";
import { loadBaselineWithoutTheFork, matchTheForkCatalogue, storeTheForkListings } from "../src/pipeline/thefork-baseline-match";

const LISBON = "https://www.thefork.com/restaurants/lisbon-c665920";
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const urls = args.flatMap((arg, i) => (arg === "--url" && args[i + 1] ? [args[i + 1]!] : []));

if (flag("--help") || flag("-h")) {
  console.log("Usage: npx tsx --env-file=.env.local scripts/sweep-thefork-baseline.ts --max-usd 5 [--url <TheFork page>]... [--max-items 2100] [--cache file.json] [--dry-run]");
  console.log("Sweeps TheFork's Lisbon pages once (about $0.002 per restaurant), matches them to baseline Restaurants by name and distance,");
  console.log("and records each confident match as a not-yet-fetched TheFork Listing. --cache reuses a saved sweep instead of paying again; --dry-run stores nothing.");
} else if (!(Number(value("--max-usd")) > 0) && !(value("--cache") && existsSync(value("--cache")!))) {
  console.error("Pass --max-usd N (a spend cap), or --cache with an existing sweep file.");
  process.exitCode = 2;
} else {
  try {
    const cache = value("--cache");
    let catalogue: TheForkSearchItem[];
    let costUsd = 0;
    if (cache && existsSync(cache)) {
      catalogue = JSON.parse(readFileSync(cache, "utf8")) as TheForkSearchItem[];
      console.log(`Reusing ${catalogue.length} swept TheFork restaurants from ${cache}; no spend.`);
    } else {
      if (!apifyConfigured()) throw new Error("APIFY_TOKEN is not set.");
      const swept = await sweepTheForkCatalogue(urls.length ? urls : [LISBON], {
        maxItems: Number(value("--max-items") ?? APIFY_CATALOGUE_MAX_ITEMS), maxUsd: Number(value("--max-usd")),
      });
      catalogue = swept.items;
      costUsd = swept.costUsd;
      if (cache) writeFileSync(cache, JSON.stringify(catalogue));
      console.log(`Swept ${catalogue.length} TheFork restaurants; Apify cost $${costUsd.toFixed(4)}.`);
    }
    const restaurants = await loadBaselineWithoutTheFork();
    const report = matchTheForkCatalogue(restaurants, catalogue);
    const stored = flag("--dry-run") ? 0 : await storeTheForkListings(report.accepted);
    console.log(JSON.stringify({
      baselineWithoutTheFork: restaurants.length, accepted: report.accepted.length, stored,
      uncertain: report.uncertain.length, none: report.none.length, sharedPage: report.sharedPage.length, apifyCostUsd: Number(costUsd.toFixed(4)),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
