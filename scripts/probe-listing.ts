// Cheap identity check for a Listing (depth 10, ~$0.001). Prints business facts and the
// shape of Review items (keys and types only), never reviewer identity or Review text.
import { getReviewTask, postReviewTask, type ReviewTaskParams } from "../src/ingest/dataforseo";

const [source, ref] = process.argv.slice(2);
if ((source !== "google" && source !== "tripadvisor") || !ref) {
  console.error("usage: probe-listing.ts google <place_id> | tripadvisor <url_path>");
  process.exit(1);
}

const shape = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return v === null ? "null" : typeof v;
};

async function main() {
  const params: ReviewTaskParams =
    source === "google" ? { source, placeId: ref!, depth: 10 } : { source: "tripadvisor", urlPath: ref!, depth: 10 };
  const { taskId, cost } = await postReviewTask(params);
  console.log(`posted ${taskId} cost $${cost}`);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    const got = await getReviewTask(source as "google" | "tripadvisor", taskId);
    if (!got) continue;
    const r = got.result as Record<string, unknown> & { items?: Record<string, unknown>[] };
    const { items, ...rest } = r;
    const facts = Object.fromEntries(
      Object.entries(rest).filter(([k]) => ["title", "sub_title", "place_id", "cid", "feature_id", "url_path", "location", "reviews_count", "rating", "rating_distribution", "items_count", "check_url"].includes(k)),
    );
    console.log("listing facts:", JSON.stringify(facts));
    console.log("result keys:", Object.keys(rest).join(", "));
    console.log("item shape:", JSON.stringify(shape(items?.[0])));
    console.log("item types:", [...new Set(items?.map((x) => x.type))].join(", "));
    const hl = items?.flatMap((x) => (Array.isArray(x.review_highlights) ? x.review_highlights : [])) as { feature?: string; assessment?: unknown }[] | undefined;
    console.log("highlight features:", JSON.stringify([...new Set(hl?.map((h) => `${h.feature}=${typeof h.assessment === "string" && /^\d$/.test(h.assessment) ? "digit" : "text"}`))]));
    return;
  }
  console.error("timed out waiting for the task");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
