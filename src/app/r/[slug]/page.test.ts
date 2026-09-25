import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RestaurantBundle } from "@/lib/api-contract";
import { rollup, type RollupFlag, type RollupReview } from "@/verdict/rollup";
import { loadRestaurantBundle } from "@/web/data";
import VerdictPageRoute from "./page";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
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
    sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", url: "https://example.com/restaurant",
      rating: 4.9, reviewCount: 20, textCount: 20, newestAt: publishedAt.toISOString(), fetchStatus: "fetched" }],
    distinctions: [], critics: [], series: [], changePoints: [], activeJob: null, ownerQuestions: [],
  };
}

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
