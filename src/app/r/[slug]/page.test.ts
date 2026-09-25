import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { INPUTS } from "@/domain/aspects";
import type { RestaurantBundle } from "@/lib/api-contract";
import { rollup, type RollupFlag, type RollupReview } from "@/verdict/rollup";
import { loadRestaurantBundle } from "@/web/data";
import VerdictPageRoute from "./page";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/web/data", () => ({ loadRestaurantBundle: vi.fn() }));

const now = new Date("2026-09-01T00:00:00.000Z");
const publishedAt = new Date("2026-08-01T00:00:00.000Z");

function bundle(incidentCount: number, moneyIncident = false, reviewCount = 20): RestaurantBundle {
  const reviews: RollupReview[] = Array.from({ length: reviewCount }, (_, i) => ({
    id: i + 1, source: "google", publishedAt, stars: 5, hasText: true, subRatings: null,
    aspects: { food: 2, service: 2, ambience: 2, value: 2, wait: 2, consistency: null },
    exceptional: "none", themes: [],
  }));
  const flags: RollupFlag[] = reviews.slice(0, incidentCount).map((review, i) => ({
    reviewId: review.id, type: "hygiene", group: "health", firstHand: true,
    verification: "confirmed", publishedAt, source: "google", evidence: `Incident ${i + 1} in the kitchen`,
  }));
  if (moneyIncident) flags.push({ reviewId: reviews[2]!.id, type: "scam_overcharge", group: "money", firstHand: true,
    verification: "confirmed", publishedAt, source: "google", evidence: "An unordered couvert was on the bill" });
  const r = rollup({ now, format: "tasca", reviews, flags });
  return {
    restaurant: { id: 1, slug: "sample", name: "Sample Restaurant", city: "Lisbon", area: null, format: "tasca", priceTier: null },
    verdict: { id: 1, state: r.state, tier: r.tier, confidence: r.confidence.level, explanation: "The food is good.",
      issuedAt: now.toISOString(), provisional: r.provisional, peerSnapshotId: null, blocks: { rollup: r, quotes: [] } },
    sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", matchProvenance: "auto_accepted", url: "https://example.com/restaurant",
      rating: 4.9, reviewCount: 20, textCount: 20, newestAt: publishedAt.toISOString(), fetchStatus: "fetched" }],
    distinctions: [], critics: [], series: [], changePoints: [], activeJob: null, ownerQuestions: [],
  };
}

function bundleWithPeers(reviewCount: number, peerCount: number): RestaurantBundle {
  const reviews: RollupReview[] = Array.from({ length: reviewCount }, (_, i) => ({
    id: i + 1, source: i % 2 ? "google" : "tripadvisor", publishedAt, stars: 5, hasText: true, subRatings: null,
    aspects: { food: 2, service: 2, ambience: 2, value: 2, wait: 2, consistency: null },
    exceptional: i < reviewCount / 2 ? "food" : "none", themes: [],
  }));
  const groups = INPUTS.map((input) => ({
    city: "Lisbon", level: "format" as const, key: "tasca", input,
    sortedTheta: Array(peerCount).fill(-1000), formatMean: 0, k: 1e9,
    composite: Array(100).fill(-1000), exceptionalPrior: { alpha: 1, beta: 20 }, peerCount,
  }));
  const r = rollup({
    now, city: "Lisbon", format: "tasca", reviews, flags: [],
    peerSnapshot: { id: 1, month: "2026-09", publishedAt: now.toISOString(), groups },
  });
  return {
    restaurant: { id: 1, slug: "sample", name: "Sample Restaurant", city: "Lisbon", area: null, format: "tasca", priceTier: null },
    verdict: { id: 1, state: r.state, tier: r.tier, confidence: r.confidence.level, explanation: "The food is good.",
      issuedAt: now.toISOString(), provisional: r.provisional, peerSnapshotId: r.peerSnapshot?.id ?? null, blocks: { rollup: r, quotes: [] } },
    sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", matchProvenance: "auto_accepted", url: "https://example.com/restaurant",
      rating: 4.9, reviewCount, textCount: reviewCount, newestAt: publishedAt.toISOString(), fetchStatus: "fetched" }],
    distinctions: [], critics: [], series: [], changePoints: [], activeJob: null, ownerQuestions: [],
  };
}

describe("Quote evidence (issue #43)", () => {
  it("opens the input's Themes and original quotes inline with a Listing link and Source access", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.themes = [{ code: "food_delicious", aspect: "food", polarity: 1, count: 3, share: 0.15 }];
    page.verdict!.blocks.quotes = [{ reviewId: 7, aspect: "food", polarity: 1,
      text: "A comida estava muito saborosa.", textEn: null, lang: "pt", stars: 5,
      source: "google", access: "personal_only", month: "2026-08" }];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Show Food Themes and quotes");
    expect(html).toContain("Food Themes and quotes");
    expect(html).toContain("A comida estava muito saborosa.");
    expect(html).toContain("Translate");
    expect(html).toContain("Personal only");
    expect(html).toContain('href="https://example.com/restaurant"');
    expect(html).not.toContain("reviewerName");
    expect(html).not.toContain("reviewPermalink");
  });
});

describe("Life Changing ceiling note (issue #36)", () => {
  it("shows the ceiling note explaining the nearest unmet Life Changing gate when the Tier lands below it", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundleWithPeers(40, 40));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Must Go");
    expect(html).toContain("Ceiling: needs at least 50 Peers at the level used, now 40.");
  });
});

describe("Tier change header (issue #39)", () => {
  it("shows the previous Tier and the date the current Tier began", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.tierChange = { from: "ok", at: "2026-09-01T12:00:00.000Z" };
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Was OK until 1 Sept 2026");
  });
  it("labels a held Tier without a stale floor claim", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.tierHeld = true;
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Tier held until the composite or a floor clearly crosses its boundary.");
  });
});

describe("Confidence and per-Source readings (issue #38)", () => {
  it("shows the quiet label next to a Source with fewer than 10 text Reviews in the last 12 months", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.sourceReadings = [{ source: "google", tier: "ok", textReviews12m: 3, quiet: true }];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Crowd Source · quiet");
  });

  it("omits the quiet label for a Source with enough text Reviews", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.sourceReadings = [{ source: "google", tier: "ok", textReviews12m: 20, quiet: false }];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).not.toContain("quiet");
  });
});

describe("Over-time chart: composite layer (issue #41)", () => {
  it("renders a filled marker for a quarter with enough Reviews and a hollow marker for one with too few", async () => {
    const page = bundleWithPeers(40, 40);
    page.verdict!.blocks.rollup.series = [
      { quarter: "2026-Q1", composite: 0.5, compositePercentile: 72, enoughReviews: true, volume: 10, textVolume: 10 },
      { quarter: "2026-Q2", composite: 0.3, compositePercentile: 55, enoughReviews: false, volume: 4, textVolume: 4 },
    ];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("chart-composite-dot-hollow");
    expect(html).toContain("P72");
    expect(html).toContain("few Reviews");
  });

  it("marks the quarter a Change point occurred in", async () => {
    const page = bundleWithPeers(40, 40);
    page.verdict!.blocks.rollup.series = [
      { quarter: "2026-Q1", composite: 0.5, compositePercentile: 72, enoughReviews: true, volume: 10, textVolume: 10 },
      { quarter: "2026-Q2", composite: 0.3, compositePercentile: 60, enoughReviews: true, volume: 10, textVolume: 10 },
    ];
    page.verdict!.blocks.rollup.changePointAt = "2026-05-15T00:00:00.000Z";
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("chart-changepoint");
    expect(html).toContain("Change point");
  });

  it("omits the composite layer on Provisional Verdicts even when compositePercentile values are present", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.series = [
      { quarter: "2026-Q1", composite: 0.5, compositePercentile: 72, enoughReviews: true, volume: 10, textVolume: 10 },
    ];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).not.toContain("Composite percentile over time");
    expect(html).not.toContain("chart-composite-dot");
  });
});

describe("Sources disagree line (issue #41)", () => {
  it("renders the disagreement sentence naming Sources, Tiers, since date and Review count", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.disagreement = {
      sources: [{ source: "google", tier: "good" }, { source: "tripadvisor", tier: "ok" }],
      since: "2025-05-01T00:00:00.000Z",
      textReviews: 42,
    };
    page.sources.push({
      code: "tripadvisor", name: "Tripadvisor", kind: "crowd", access: "public_ok", matchProvenance: "proposed_confirmed",
      url: "https://example.com/tripadvisor", rating: 4.5, reviewCount: 20, textCount: 20,
      newestAt: publishedAt.toISOString(), fetchStatus: "fetched",
    });
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Google reads Good, Tripadvisor reads OK since May 2025 (42 Reviews)");
  });

  it("omits the disagreement line when Sources agree", async () => {
    const page = bundle(0);
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).not.toContain("reads");
  });
});

describe("Restaurant Verdict red flags", () => {
  it("shows a quiet callout and its evidence for one incident while retaining the standings", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(1));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Red flag · Health: 1 verified first-hand incident");
    expect(html).toContain("Incident 1 in the kitchen");
    expect(html).toContain("blocks Life Changing");
    expect(html).toContain("Where it stands");
    expect(html).toContain("Sources");
    expect(html).toContain("4.9");
  });

  it("keeps a single verified incident visible when there is not enough evidence for a Tier", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(1, false, 5));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Not enough evidence");
    expect(html).toContain("Red flag · Health: 1 verified first-hand incident");
    expect(html).toContain("Incident 1 in the kitchen");
  });

  it("shows only the loud callout, incident quotes and Sources for a forced Avoid", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(2, true));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Avoid");
    expect(html).toContain("Recurring recent incidents force Avoid");
    expect(html).toContain("Incident 1 in the kitchen");
    expect(html).toContain("Incident 2 in the kitchen");
    expect(html).toContain("Money: 1 verified first-hand incident");
    expect(html).toContain("An unordered couvert was on the bill");
    expect(html).toContain('aria-label="5 stars"');
    expect(html).toContain("Sources");
    expect(html).not.toContain("Where it stands");
    expect(html).not.toContain("Confidence");
    expect(html).not.toContain("What people say");
    expect(html).not.toContain("Composite");
    expect(html).toContain("4.9");
  });
});

describe("Undo auto-accepted Listing (issue #51)", () => {
  it("offers Undo only beside automatically accepted Listings", async () => {
    const page = bundle(0);
    page.sources.push({
      code: "tripadvisor", name: "Tripadvisor", kind: "crowd", access: "public_ok", matchProvenance: "proposed_confirmed",
      url: "https://example.com/tripadvisor", rating: 4.5, reviewCount: 20, textCount: 20,
      newestAt: publishedAt.toISOString(), fetchStatus: "fetched",
    });
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Undo");
    expect(html).toContain('aria-label="Undo automatically accepted google Listing"');
    expect(html).not.toContain('aria-label="Undo automatically accepted tripadvisor Listing"');
  });
});
