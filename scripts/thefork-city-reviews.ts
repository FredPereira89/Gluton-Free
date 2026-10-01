import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  APIFY_CATALOGUE_MAX_ITEMS, ApifyError, apifyConfigured, fetchTheForkNearbyWithReviews, sweepTheForkCatalogue,
  type TheForkCityRestaurant, type TheForkSearchItem,
} from "../src/ingest/apify";
import { closeDb } from "../src/lib/db";
import {
  judgeWithTheFork, loadRestaurantsWithoutTheFork, matchTheForkCatalogue, storeTheForkMatches, type TheForkAcceptance,
} from "../src/pipeline/thefork-baseline-match";

const LISBON = "https://www.thefork.com/restaurants/lisbon-c665920";
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const readJson = <T>(file: string | undefined, fallback: T): T => (file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as T : fallback);

if (flag("--help") || flag("-h")) {
  console.log("Usage: npx tsx --env-file=.env.local scripts/thefork-city-reviews.ts --catalogue cat.json --profiles profiles.json");
  console.log("       [--sweep-max-usd 3] [--reviews-max-usd 5] [--accept id:placeRef,...] [--nearby-results 3] [--retry-not-found] [--dry-run] [--judge --max-llm-usd 2]");
  console.log("Matches every Restaurant without a TheFork Listing against a swept TheFork city catalogue (--catalogue: reused when it exists,");
  console.log("else swept once at about $0.002 per restaurant under --sweep-max-usd), fetches the newest Reviews of each confident match");
  console.log("with a nearby search at about $0.03 (--reviews-max-usd; profiles already in --profiles are not paid for again),");
  console.log("stores the Listings with their Reviews, and with --judge re-judges them. --dry-run matches and fetches but stores nothing.");
} else if (!value("--catalogue") || !value("--profiles")) {
  console.error("Pass --catalogue and --profiles file paths (see --help).");
  process.exitCode = 2;
} else {
  try {
    const maxLlmUsd = Number(value("--max-llm-usd") ?? 2);
    let apifyCostUsd = 0;
    let catalogue = readJson<TheForkSearchItem[] | null>(value("--catalogue"), null);
    if (catalogue) console.log(`Reusing ${catalogue.length} swept TheFork restaurants; no spend.`);
    else {
      const maxUsd = Number(value("--sweep-max-usd"));
      if (!(maxUsd > 0)) throw new Error("No catalogue file yet: pass --sweep-max-usd N to sweep Lisbon once.");
      if (!apifyConfigured()) throw new Error("APIFY_TOKEN is not set.");
      const swept = await sweepTheForkCatalogue([LISBON], { maxItems: APIFY_CATALOGUE_MAX_ITEMS, maxUsd });
      catalogue = swept.items;
      apifyCostUsd += swept.costUsd;
      writeFileSync(value("--catalogue")!, JSON.stringify(catalogue));
      console.log(`Swept ${catalogue.length} TheFork restaurants; Apify cost $${swept.costUsd.toFixed(4)}.`);
    }

    const profilesFile = value("--profiles")!;
    const saved = readJson<{ restaurants: TheForkCityRestaurant[]; notFound?: string[] }>(profilesFile, { restaurants: [] });
    const notFound = new Set(flag("--retry-not-found") ? [] : saved.notFound ?? []);
    const nearbyResults = Number(value("--nearby-results") ?? 3);
    const saveProfiles = () => writeFileSync(profilesFile, JSON.stringify({ restaurants: [...profiles.values()], notFound: [...notFound] }));
    const profiles = new Map(saved.restaurants.map((restaurant) => [String(restaurant.id), restaurant]));
    const everything = new Map<string, TheForkSearchItem>(catalogue.map((item) => [String(item.id), item]));
    for (const [id, restaurant] of profiles) everything.set(id, restaurant);

    const restaurants = await loadRestaurantsWithoutTheFork();
    const report = matchTheForkCatalogue(restaurants, [...everything.values()]);

    // Candidates the owner approved by hand, "restaurantId:placeRef,...": they join the accepted matches but are stored as confirmed.
    const approved: TheForkAcceptance[] = (value("--accept") ?? "").split(",").filter(Boolean).map((pair) => {
      const [id, placeRef] = pair.split(":");
      const page = everything.get(placeRef!);
      if (!page?.url || !restaurants.some((restaurant) => restaurant.id === Number(id))) throw new Error(`--accept ${pair}: no such Restaurant or TheFork page.`);
      return { restaurantId: Number(id), placeRef: placeRef!, url: page.url, reviewCount: page.thefork_review_count ?? null };
    });
    const reviewsMaxUsd = Number(value("--reviews-max-usd") ?? 0);
    let reviewsCostUsd = 0, missing = 0;
    for (const match of [...report.accepted, ...approved]) {
      if (profiles.has(match.placeRef)) continue;
      if (notFound.has(match.placeRef)) { missing++; continue; }
      const restaurant = restaurants.find((candidate) => candidate.id === match.restaurantId)!;
      if (reviewsCostUsd + Math.max(0.1, 0.02 * nearbyResults) > reviewsMaxUsd) { missing++; continue; }
      try {
        const fetched = await fetchTheForkNearbyWithReviews({ lat: restaurant.lat, lng: restaurant.lng }, match.placeRef, nearbyResults);
        reviewsCostUsd += fetched.costUsd;
        if (fetched.restaurant) profiles.set(match.placeRef, fetched.restaurant);
        else { notFound.add(match.placeRef); missing++; }
        saveProfiles();
      } catch (error) {
        // One failed fetch (it may have charged) must not lose the others: count it, keep going, and retry it on the next run.
        reviewsCostUsd += error instanceof ApifyError ? error.costUsd : 0;
        missing++;
      }
    }
    apifyCostUsd += reviewsCostUsd;

    const stored = flag("--dry-run") ? [] : [
      ...await storeTheForkMatches(report.accepted, [...profiles.values()]),
      ...await storeTheForkMatches(approved, [...profiles.values()], "proposed_confirmed"),
    ];
    let llmCostUsd = 0;
    const failed: number[] = [];
    if (flag("--judge") && !flag("--dry-run")) {
      for (const id of stored) {
        if (llmCostUsd >= maxLlmUsd) { console.log(`LLM cap reached at $${llmCostUsd.toFixed(4)}; the rest keep their earlier Verdict.`); break; }
        try { llmCostUsd += await judgeWithTheFork(id); } catch { failed.push(id); }
      }
    }
    console.log(JSON.stringify({
      catalogue: catalogue.length, restaurantsWithoutTheFork: restaurants.length, accepted: report.accepted.length, withoutReviews: missing,
      stored: stored.length, uncertain: report.uncertain.length, none: report.none.length, sharedPage: report.sharedPage.length,
      judgeFailed: failed, apifyCostUsd: Number(apifyCostUsd.toFixed(4)), llmCostUsd: Number(llmCostUsd.toFixed(4)),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
