import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { INPUTS } from "@/domain/aspects";
import type { RestaurantBundle } from "@/lib/api-contract";
import { rollup, type RollupFlag, type RollupReview } from "@/verdict/rollup";
import { pageRole } from "@/lib/page-role";
import { loadRestaurantBundle } from "@/web/data";
import VerdictPageRoute from "./page";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/web/data", () => ({ loadRestaurantBundle: vi.fn() }));
vi.mock("@/lib/page-role", () => ({ pageRole: vi.fn().mockResolvedValue("owner") }));

const now = new Date("2026-09-01T00:00:00.000Z");
const publishedAt = new Date("2026-08-01T00:00:00.000Z");

describe("Restaurant details (issue #53)", () => {
  it("shows owner controls for Format and Price tier on the Restaurant page", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(0));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Restaurant details");
    expect(html).toContain("Format");
    expect(html).toContain("Price tier");
    expect(html).toContain("Save Restaurant details");
  });
});

describe("Shared directory labels (issue #111)", () => {
  it("shows the human Format label and the booking link on the report, for the Owner and an Invitee", async () => {
    const page = bundle(0);
    page.restaurant = { ...page.restaurant, format: "casa_de_fado", booking: { label: "Book on TheFork", url: "https://www.thefork.pt/restaurante/sample-r1", kind: "thefork" } };
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    for (const role of ["owner", "invitee"] as const) {
      vi.mocked(pageRole).mockResolvedValueOnce(role);
      const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
      expect(html).toContain("Casa de fado");
      expect(html).not.toContain("Casa_de_fado");
      expect(html).toContain('href="https://www.thefork.pt/restaurante/sample-r1"');
      expect(html).toContain("Book on TheFork");
    }
  });
});

describe("Source attribution", () => {
  it.each(["owner", "invitee"] as const)("omits mismatched links throughout the %s Report without hiding Evidence", async (role) => {
    const page = bundle(3);
    const wrongUrl = "https://www.instagram.com/zedatasca_oficial/";
    page.sources[0]!.url = wrongUrl;
    page.verdict!.blocks.quotes = [{ reviewId: 7, aspect: "food", polarity: 1, text: "Delicious meal", textEn: null, lang: "en", stars: 5, source: "google", month: "2026-08" }];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    vi.mocked(pageRole).mockResolvedValueOnce(role);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).not.toContain(`href="${wrongUrl}"`);
    expect(html).not.toContain("on Google</span>");
    expect(html).toContain("Delicious meal");
    expect(html).toContain("Incident 1 in the kitchen");
    expect(html).toContain("<h3>Google</h3>");
    expect(html).toContain("Source link unavailable.");
  });
});

describe("Invitee view (issue #109)", () => {
  it("marks every report state for an Invitee so the shell hides Settings, and not for the Owner", async () => {
    for (const variant of [{ ...bundle(1), verdict: null }, bundle(1)]) {
      vi.mocked(loadRestaurantBundle).mockResolvedValue(variant);
      vi.mocked(pageRole).mockResolvedValueOnce("invitee");
      expect(renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }))).toContain("invitee-view");
      expect(renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }))).not.toContain("invitee-view");
    }
  });

  const SCRUBBED_PERSONAL = "SCRUBBED personal-only quote";
  const SCRUBBED_PUBLIC = "SCRUBBED shareable quote";
  const SCRUBBED_EVIDENCE = "SCRUBBED personal-only incident evidence";
  function ownerBundle(): RestaurantBundle {
    const page = bundle(1);
    page.restaurant = { ...page.restaurant, formatProvenance: "llm" };
    page.sources.push({ code: "tripadvisor", name: "Tripadvisor", kind: "crowd", access: "public_ok", matchProvenance: "pasted", url: "https://www.tripadvisor.com/Restaurant_Review-g189158-d123-Reviews-Sample-Lisbon.html",
      rating: 4, reviewCount: 3, textCount: 3, newestAt: publishedAt.toISOString(), fetchStatus: "fetched" });
    const flag = page.verdict!.blocks.rollup.redFlags[0]!;
    flag.incidents = flag.incidents!.map((incident) => ({ ...incident, evidence: SCRUBBED_EVIDENCE }));
    page.verdict!.blocks.rollup.themes = [{ code: "food_delicious", aspect: "food", polarity: 1, count: 3, share: 0.15 }];
    const quote = (reviewId: number, text: string, source: string) => ({ reviewId, aspect: "food" as const, polarity: 1 as const, text, textEn: null, lang: "pt", stars: 5, source, month: "2026-08" });
    page.verdict!.blocks.quotes = [quote(7, SCRUBBED_PERSONAL, "google"), quote(8, SCRUBBED_PUBLIC, "tripadvisor")];
    page.distinctions = [{ id: 7, guide: "Guia Repsol", level: "Solete", editionYear: 2026, url: "https://www.guiarepsol.com/sample" }];
    page.critics = [{ id: 9, publication: "Time Out", title: "Sample piece", url: "https://example.com/piece", publishedOn: null, language: null, printedRating: null }];
    page.changePoints = [{ id: 4, occurredOn: "2026-03-01", description: "New chef" }];
    page.activeJob = { id: 5, kind: "refresh", status: "running", step: "reading new Reviews", createdAt: now.toISOString(), newReviews: 8 };
    page.ownerQuestions = [{ id: 6, kind: "retry_source", source: "google", prompt: "Retry Google?" }];
    page.unavailableSources = [{ source: "thefork", detail: "TheFork matching could not run" }];
    return page;
  }
  const render = async () => renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));

  it("shows an Invitee the same report as the Owner: Source links, quotes, Sources table, incident evidence and Change points", async () => {
    vi.mocked(pageRole).mockResolvedValueOnce("invitee");
    vi.mocked(loadRestaurantBundle).mockResolvedValue(ownerBundle());
    const html = await render();
    expect(html).toContain("Sample Restaurant");
    expect(html).toContain("Reviewers rate it well");
    expect(html).toContain("Delicious food");
    expect(html).toContain("See how this verdict has changed");
    expect(html).toContain("In their words");
    for (const text of [SCRUBBED_PERSONAL, SCRUBBED_PUBLIC, SCRUBBED_EVIDENCE, "(proposed)", "<h2>Sources</h2>", "2026-03-01: New chef"]) expect(html, text).toContain(text);
    expect(html).toContain('href="https://maps.google.com/?cid=12345"');
    expect(html).toContain('href="https://www.tripadvisor.com/Restaurant_Review-g189158-d123-Reviews-Sample-Lisbon.html"');
    expect(html).not.toContain("The food is good.");
    expect(html).not.toContain("Technical explanation");
  });

  it("renders no Owner tool, Owner question, job line or Listing undo for an Invitee", async () => {
    vi.mocked(pageRole).mockResolvedValueOnce("invitee");
    vi.mocked(loadRestaurantBundle).mockResolvedValue(ownerBundle());
    const html = await render();
    for (const owner of [
      "<input", "<select", "Save Restaurant details", "Declare Change point", "Delete ", "Translate", "Undo",
      "Owner questions", "Retry Google", "new Reviews being read", "TheFork", "Add it by hand", "Personal only", "Public OK",
    ]) expect(html, owner).not.toContain(owner);
    expect(html).toContain("What seems wrong?");
    expect(html).toContain("Send feedback");
    expect(html).not.toMatch(/Current.*job/);
  });

  it("renders the Owner's tools and Sources table when the caller is the Owner", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(ownerBundle());
    const html = await render();
    for (const owner of ["Save Restaurant details", "Declare Change point", "Owner questions", "(proposed)", "In their words", SCRUBBED_PERSONAL, SCRUBBED_PUBLIC, SCRUBBED_EVIDENCE, "<h2>Sources</h2>"]) expect(html, owner).toContain(owner);
    expect(html).toMatch(/Current.*job/);
  });

  it("projects a Restaurant with no Verdict yet and the Not-enough-evidence layout too", async () => {
    vi.mocked(pageRole).mockResolvedValueOnce("invitee");
    vi.mocked(loadRestaurantBundle).mockResolvedValue({ ...ownerBundle(), verdict: null });
    const html = await render();
    expect(html).toContain("No Verdict yet");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Owner questions");
  });
});

describe("Monthly refresh (issue #72)", () => {
  it("keeps the current Verdict visible with a new-Reviews banner while refreshing", async () => {
    const page = bundle(0);
    page.activeJob = {
      id: 72, kind: "refresh", status: "running", step: "reading new Reviews",
      createdAt: now.toISOString(), newReviews: 8,
    };
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("8 new Reviews being read");
    expect(html).toContain("Reviewers rate it well");
    expect(html).toContain('role="status"');
  });
});

describe("Removed from the report (issue #112)", () => {
  it("shows no Distinctions, critic pieces or stars-and-volume chart to the Owner or an Invitee", async () => {
    const page = bundle(0);
    page.distinctions = [{ id: 7, guide: "Guia Repsol", level: "Solete", editionYear: 2026, url: "https://www.guiarepsol.com/sample" }];
    page.critics = [{ id: 9, publication: "Time Out", title: "Sample piece", url: "https://example.com/piece", publishedOn: null, language: null, printedRating: null }];
    page.verdict!.blocks.rollup.sourceHistory = [{ source: "google", quarters: [{ quarter: "2026-Q1", stars: 4.5, ratings: 9, volume: 12 }] }];
    page.series = [{ quarter: "2026-Q1", composite: 0.5, volume: 12, textVolume: 10 }];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    for (const role of ["owner", "invitee"] as const) {
      vi.mocked(pageRole).mockResolvedValueOnce(role);
      const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
      for (const gone of ["Guia Repsol", "Solete", "Distinction", "Time Out", "Sample piece", "Critic", "Stars and Review volume", "chart-stars", "Review volume over time"]) {
        expect(html, `${role}: ${gone}`).not.toContain(gone);
      }
    }
  });
});

function bundle(incidentCount: number, moneyIncident = false, reviewCount = 20): RestaurantBundle {
  const reviews: RollupReview[] = Array.from({ length: reviewCount }, (_, i) => ({
    id: i + 1, source: "google", publishedAt, stars: 5, hasText: true, subRatings: null,
    aspects: { food: 2, service: 2, ambience: 2, value: 2, wait: 2, consistency: null },
    exceptional: "none", themes: [],
  }));
  const flags: RollupFlag[] = reviews.slice(0, incidentCount).map((review, i) => ({
    reviewId: review.id, type: "food_poisoning", group: "health", firstHand: true,
    verification: "confirmed", publishedAt, source: "google", evidence: `Incident ${i + 1} in the kitchen`,
  }));
  if (moneyIncident) flags.push({ reviewId: reviews[2]!.id, type: "scam_overcharge", group: "money", firstHand: true,
    verification: "confirmed", publishedAt, source: "google", evidence: "An unordered couvert was on the bill" });
  const r = rollup({ now, format: "tasca", reviews, flags });
  return {
    restaurant: { id: 1, slug: "sample", name: "Sample Restaurant", city: "Lisbon", area: null, address: "Rua do Sample 1", format: "tasca", priceTier: "€€" },
    verdict: { id: 1, state: r.state, tier: r.tier, confidence: r.confidence.level, explanation: "The food is good.",
      issuedAt: now.toISOString(), provisional: r.provisional, peerSnapshotId: null, blocks: { rollup: r, quotes: [] } },
    reportFacts: { standoutDishes: [], dietaryFits: [] },
    sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", matchProvenance: "auto_accepted", url: "https://maps.google.com/?cid=12345",
      rating: 4.9, reviewCount: 20, textCount: 20, newestAt: publishedAt.toISOString(), fetchStatus: "fetched" }],
    distinctions: [], critics: [], series: [], changePoints: [], activeJob: null, ownerQuestions: [], unavailableSources: [],
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
    restaurant: { id: 1, slug: "sample", name: "Sample Restaurant", city: "Lisbon", area: null, address: "Rua do Sample 1", format: "tasca", priceTier: "€€" },
    verdict: { id: 1, state: r.state, tier: r.tier, confidence: r.confidence.level, explanation: "The food is good.",
      issuedAt: now.toISOString(), provisional: r.provisional, peerSnapshotId: r.peerSnapshot?.id ?? null, blocks: { rollup: r, quotes: [] } },
    reportFacts: { standoutDishes: [], dietaryFits: [] },
    sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", matchProvenance: "auto_accepted", url: "https://maps.google.com/?cid=12345",
      rating: 4.9, reviewCount, textCount: reviewCount, newestAt: publishedAt.toISOString(), fetchStatus: "fetched" }],
    distinctions: [], critics: [], series: [], changePoints: [], activeJob: null, ownerQuestions: [], unavailableSources: [],
  };
}

describe("Quote evidence (issue #43)", () => {
  it("shows the Owner original quotes with a Listing link and Source access, and an Invitee the same quotes read-only", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.themes = [{ code: "food_delicious", aspect: "food", polarity: 1, count: 3, share: 0.15 }];
    page.verdict!.blocks.quotes = [{ reviewId: 7, aspect: "food", polarity: 1,
      text: "A comida estava muito saborosa.", textEn: null, lang: "pt", stars: 5,
      source: "google", access: "personal_only", month: "2026-08" }];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("In their words");
    expect(html).toContain("A comida estava muito saborosa.");
    expect(html).toContain("Translate");
    expect(html).toContain("Personal only");
    expect(html).toContain('href="https://maps.google.com/?cid=12345"');
    expect(html).not.toContain("reviewerName");
    expect(html).not.toContain("reviewPermalink");
    vi.mocked(pageRole).mockResolvedValueOnce("invitee");
    const invitee = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(invitee).toContain("In their words");
    expect(invitee).toContain("A comida estava muito saborosa.");
    expect(invitee).toContain('href="https://maps.google.com/?cid=12345"');
    expect(invitee).not.toContain("Translate");
    expect(invitee).not.toContain("Personal only");
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
    expect(html).toContain("Review site · few recent Reviews");
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
    expect(html).toContain("Better food than almost all tascas in Lisbon");
    expect(html).toContain("few reviews");
    expect(html).not.toMatch(/Pd/);
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
    expect(html).toContain("only reviews since then count");
  });

  it("omits the composite layer on Provisional Verdicts even when compositePercentile values are present", async () => {
    const page = bundle(0);
    page.verdict!.blocks.rollup.series = [
      { quarter: "2026-Q1", composite: 0.5, compositePercentile: 72, enoughReviews: true, volume: 10, textVolume: 10 },
    ];
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).not.toContain("How its standing has moved");
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
    expect(html).toContain("1 recent review reports food poisoning");
    expect(html).toContain("Incident 1 in the kitchen");
    expect(html).toContain("blocks Life Changing");
    expect(html).toContain("How we judged this");
    expect(html).toContain("Sources");
    expect(html).toContain("4.9");
  });

  it("keeps a single verified incident visible when there is not enough evidence for a Tier", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(1, false, 5));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Not enough evidence");
    expect(html).toContain("1 recent review reports food poisoning");
    expect(html).toContain("Incident 1 in the kitchen");
  });

  it("shows only the loud callout, incident quotes and Sources for a forced Avoid", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(2, true));
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    expect(html).toContain("Avoid");
    expect(html).toContain("Recurring recent incidents force Avoid");
    expect(html).toContain("Incident 1 in the kitchen");
    expect(html).toContain("Incident 2 in the kitchen");
    expect(html).toContain("2 recent reviews report food poisoning");
    expect(html).toContain("1 recent review reports overcharging");
    expect(html).toContain("An unordered couvert was on the bill");
    expect(html).toContain('aria-label="5 out of 5 stars"');
    expect(html).toContain("Sources");
    expect(html).not.toContain("How it compares");
    expect(html).not.toContain("What reviewers say");
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

describe("Decision-first report (issue #112)", () => {
  const render = async (role: "owner" | "invitee", page: RestaurantBundle) => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    vi.mocked(pageRole).mockResolvedValueOnce(role);
    return renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
  };
  const JARGON = /θ|\bP\d|\bSD\b|snapshot|Peer composites/i;
  const withThemes = (page: RestaurantBundle) => {
    const t = (code: "food_delicious" | "service_warm" | "food_fresh" | "food_generous_portions" | "service_slow" | "food_bland", polarity: 1 | -1, count: number) =>
      ({ code, aspect: code.startsWith("service") ? "service" as const : "food" as const, polarity, count, share: count / 100 });
    page.verdict!.blocks.rollup.themes = [
      t("food_delicious", 1, 30), t("service_warm", 1, 20), t("food_fresh", 1, 10), t("food_generous_portions", 1, 8),
      t("service_slow", -1, 12), t("food_bland", -1, 1),
    ];
    page.verdict!.blocks.rollup.confidence.caps = ["only one Crowd Source", "Sources disagree by 33 points (google: P72, tripadvisor: P39)", "invented reason, θ 0.4"];
    return page;
  };

  it("leads with Tier, a plain reason, Format, Price tier, address and booking link for the Owner and an Invitee", async () => {
    for (const role of ["owner", "invitee"] as const) {
      const page = withThemes(bundleWithPeers(40, 40));
      page.restaurant.booking = { label: "Book on TheFork", url: "https://www.thefork.pt/restaurante/sample-r1", kind: "thefork" };
      const html = await render(role, page);
      expect(html, role).toContain("Must Go");
      expect(html, role).toContain("Better food than almost all tascas in Lisbon");
      expect(html, role).toContain("Tasca");
      expect(html, role).toContain("€€");
      expect(html, role).toContain("Rua do Sample 1, Lisbon");
      expect(html, role).toContain("Book on TheFork");
      expect(html, role).toContain("See how this verdict has changed");
    }
  });

  it("shows rule-backed standout dishes with counts and dietary fit to the Owner and Invitee, and hides empty facts", async () => {
    const page = bundleWithPeers(40, 40);
    page.reportFacts = {
      standoutDishes: [{ name: "Bacalhau à Brás", count: 5 }, { name: "Pastel de nata", count: 3 }],
      dietaryFits: ["vegan", "gluten_free"],
    };
    for (const role of ["owner", "invitee"] as const) {
      const html = await render(role, page);
      expect(html, role).toContain("Standout dishes");
      expect(html, role).toContain("Bacalhau à Brás");
      expect(html, role).toContain("5 reviews");
      expect(html, role).toContain("Dietary fit");
      expect(html, role).toContain("Vegan options");
      expect(html, role).toContain("Gluten-free options");
    }
    const empty = await render("invitee", { ...bundle(0), reportFacts: { standoutDishes: [], dietaryFits: [] } });
    expect(empty).not.toContain("Standout dishes");
    // Missing dietary information is stated, never left as a silent gap.
    expect(empty).toContain("No dietary information in the Reviews yet");
  });

  it("lists the top 3 strengths and warnings with how many reviewers raise them", async () => {
    const html = await render("invitee", withThemes(bundleWithPeers(40, 40)));
    expect(html).toContain("Delicious food");
    expect(html).toContain("30 reviewers");
    expect(html).toContain("Warm, friendly staff");
    expect(html).toContain("Fresh ingredients");
    expect(html).not.toContain("Generous portions");
    expect(html).toContain("Slow service");
    expect(html).toContain("12 reviewers");
    expect(html).toContain("1 reviewer<");
  });

  it("puts the plain summary and theme chips in report highlights, and the bar graphs inside 'How we judged this'", async () => {
    const html = await render("invitee", withThemes(bundleWithPeers(40, 40)));
    const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf("</section>"));
    const highlightsStart = html.indexOf('<section class="sec report-highlights"');
    const highlights = html.slice(highlightsStart, html.indexOf("</section>", highlightsStart));
    expect(highlights).toContain("hero-summary");
    expect(highlights).toContain("better than almost all tascas in Lisbon");
    expect(highlights).toContain("Reviewers praise");
    expect(highlights).toContain('theme-chip pos">Delicious food <b>30</b>');
    expect(highlights).toContain("Reviewers warn");
    expect(hero).not.toContain('class="scorecard"');
    expect(hero).not.toContain('class="bars');
    const judged = html.slice(html.indexOf('<section class="sec judged"'));
    expect(judged).toContain('class="scorecard"');
    expect(judged).toContain('class="bars');
  });

  it("states each Aspect standing in words", async () => {
    const html = await render("invitee", bundleWithPeers(40, 40));
    expect(html).toContain("Against tascas in Lisbon");
    expect(html).toContain('aria-label="Food: better than almost all tascas in Lisbon"');
    expect(html).toContain('aria-label="Service: better than almost all tascas in Lisbon"');
    expect(html).toContain('<span class="score-text">better than almost all</span>');
    expect(html).toMatch(/class="score lv-5"/);
  });

  it("shows the reasoning openly under 'How we judged this' with Peer group, positions, chart, confidence and consistency", async () => {
    const page = withThemes(bundleWithPeers(40, 40));
    page.verdict!.blocks.rollup.series = [{ quarter: "2026-Q1", composite: 0.5, compositePercentile: 72, enoughReviews: true, volume: 10, textVolume: 10 }];
    const html = await render("invitee", page);
    const judged = html.slice(html.indexOf('<section class="sec judged"'));
    expect(judged).toContain("How we judged this");
    expect(judged).toContain("Compared with 40 tascas in Lisbon");
    expect(judged).toContain("Aspect positions");
    expect(judged).toContain("How its standing has moved");
    expect(judged).toContain("Confidence");
    expect(judged).toContain("Consistency");
    expect(judged).toContain("Only one review site was found");
    expect(judged).toContain("Review sites disagree about this restaurant");
  });

  it("shows an Invitee no θ, percentile numbers, SD, Peer-snapshot language, raw confidence reasons, ceiling notes or explanation", async () => {
    const page = withThemes(bundleWithPeers(40, 40));
    page.verdict!.blocks.rollup.series = [{ quarter: "2026-Q1", composite: 0.5, compositePercentile: 72, enoughReviews: true, volume: 10, textVolume: 10 }];
    const html = await render("invitee", page);
    expect(html).not.toMatch(JARGON);
    expect(html).not.toContain("invented reason");
    expect(html).not.toContain("Ceiling:");
    expect(html).not.toContain("The food is good.");
  });

  it("gives the Owner the same plain report, plus why the Tier landed, with no technical explanation", async () => {
    const html = await render("owner", withThemes(bundleWithPeers(40, 40)));
    const judged = html.slice(html.indexOf('<section class="sec judged"'));
    expect(judged).toContain("Why this Tier (Owner)");
    expect(judged).toContain("Ceiling: needs at least 50 Peers");
    expect(html).not.toContain("Technical explanation");
    expect(html).not.toContain("The food is good.");
    expect(html).not.toMatch(/θ|Peer snapshot #|Peer composites/);
  });
  it("shows every input in the position chart, including Overall stars and the one not counted", async () => {
    const page = bundleWithPeers(40, 40);
    page.verdict!.blocks.rollup.inputs = page.verdict!.blocks.rollup.inputs.map((i) => (i.input === "ambience" ? { ...i, counted: false } : i));
    const html = await render("invitee", page);
    expect(html).toContain('aria-label="Overall stars:');
    expect(html).toMatch(/class="score lv-[1-5] off"/);
    expect(html).toContain("not counted");
  });

  it("labels a Provisional Verdict 'Early verdict: fewer comparisons yet' with a plain reason", async () => {
    for (const role of ["owner", "invitee"] as const) {
      const html = await render(role, bundle(0));
      expect(html, role).toContain("Early verdict: fewer comparisons yet");
      expect(html, role).toContain("Reviewers rate it well");
    }
    expect(await render("invitee", bundle(0))).not.toMatch(JARGON);
  });

  it("explains a Change point in plain words", async () => {
    const page = bundleWithPeers(40, 40);
    page.verdict!.blocks.rollup.changePointAt = "2026-03-10T00:00:00.000Z";
    page.verdict!.blocks.rollup.changePointDescription = "New chef";
    for (const role of ["owner", "invitee"] as const) {
      expect(await render(role, page), role).toContain("New chef since Mar 2026: only reviews since then count");
    }
  });

  it("says what is missing for Not enough evidence, without jargon, for the Owner and an Invitee", async () => {
    for (const role of ["owner", "invitee"] as const) {
      const html = await render(role, bundle(0, false, 5));
      expect(html, role).toContain("Not enough evidence");
      expect(html, role).toContain("Needs at least 15 reviews with written text; has 5");
      expect(html, role).toContain("Needs at least 8 reviews that talk about the food");
    }
    expect(await render("invitee", bundle(0, false, 5))).not.toMatch(JARGON);
  });

  it("words Red flags as what reviewers report, with the same evidence for the Owner and an Invitee", async () => {
    const invitee = await render("invitee", bundle(4));
    expect(invitee).toContain("4 recent reviews report food poisoning");
    expect(invitee).toContain("Incident 1 in the kitchen");
    expect(invitee).not.toMatch(JARGON);
    expect(await render("owner", bundle(4))).toContain("Incident 1 in the kitchen");
  });

  it("shows the Sources table to the Owner and an Invitee", async () => {
    for (const role of ["owner", "invitee"] as const) expect(await render(role, bundle(0)), role).toContain("<h2>Sources</h2>");
  });
});

describe("Trend chip (issue #113)", () => {
  const series = (perQuarter: number) => ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"].map((quarter, i) => ({
    quarter, composite: 0, compositePercentile: 50 + perQuarter * i, enoughReviews: true, volume: 10, textVolume: 10,
  }));
  const render = async (role: "owner" | "invitee", page: RestaurantBundle) => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(page);
    vi.mocked(pageRole).mockResolvedValueOnce(role);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      return renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
    } finally {
      vi.useRealTimers();
    }
  };
  const withTrend = (perQuarter: number, confidence: "low" | "medium" | "high") => {
    const page = bundleWithPeers(40, 40);
    page.verdict!.blocks.rollup.series = series(perQuarter);
    page.verdict!.blocks.rollup.confidence = { ...page.verdict!.blocks.rollup.confidence, level: confidence };
    return page;
  };

  it("shows the Trend in the report hero to the Owner and an Invitee", async () => {
    for (const role of ["owner", "invitee"] as const) {
      expect(await render(role, withTrend(10, "high")), role).toContain("trend-improving");
      expect(await render(role, withTrend(-10, "medium")), role).toContain("trend-slipping");
      expect(await render(role, withTrend(0, "medium")), role).toContain("trend-steady");
    }
  });

  it("shows no Trend at Low Confidence or with under a year of Reviews", async () => {
    expect(await render("owner", withTrend(10, "low"))).not.toMatch(/trend-(improving|steady|slipping)/);
    const young = withTrend(10, "high");
    young.verdict!.blocks.rollup.series = series(10).slice(2);
    expect(await render("owner", young)).not.toMatch(/trend-(improving|steady|slipping)/);
  });
});

describe("Tier legend (issue #119)", () => {
  it("is reachable from the report for the Owner and an Invitee, with the plain Tier meanings", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundle(0));
    for (const role of ["owner", "invitee"] as const) {
      vi.mocked(pageRole).mockResolvedValueOnce(role);
      const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "sample" }) }));
      expect(html).toContain("What do the Tiers mean?");
      expect(html).toContain("Reviewers report real problems");
    }
  });
});
