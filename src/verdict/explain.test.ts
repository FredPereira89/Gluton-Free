import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyUsage, JUDGE_MODEL } from "@/analysis/llm";
import { rollup, type Rollup, type RollupReview } from "./rollup";

const parse = vi.fn();
vi.mock("@/analysis/llm", async (original) => ({
  ...await original<typeof import("@/analysis/llm")>(),
  anthropic: () => ({ messages: { parse } }),
}));

const now = new Date("2026-09-01T00:00:00Z");
const reviews: RollupReview[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1, source: i % 2 ? "google" : "tripadvisor", publishedAt: now,
  stars: 5, hasText: true, subRatings: null,
  aspects: { food: 2, service: 2, ambience: null, value: 2, wait: null, consistency: null },
  exceptional: "none", themes: [],
}));

function computed(): Rollup {
  return rollup({ now, format: "tasca", city: "Lisbon", reviews, flags: [] });
}

function answer(explanation: string) {
  return { usage: { input_tokens: 10, output_tokens: 10 }, parsed_output: { explanation, quotes: [] }, stop_reason: "end_turn" };
}

beforeEach(() => parse.mockReset());

describe("explainAndQuote", () => {
  it("keeps a passing explanation from the Anthropic fake", async () => {
    const { explainAndQuote } = await import("./explain");
    const r = computed();
    const explanation = `**${r.tier === "must_go" ? "Must Go" : "Good"}** is provisional against default cut-offs, led by food and service. Confidence is Low because it is provisional.`;
    // Use the computed Tier so the test remains about the public explanation contract.
    const { TIER_LABEL } = await import("@/domain/aspects");
    const passing = explanation.replace(/\*\*(Must Go|Good)\*\*/, `**${TIER_LABEL[r.tier!]}**`);
    parse.mockResolvedValueOnce(answer(passing));
    const result = await explainAndQuote({ name: "Test", formatName: "tasca", rollup: r, candidates: [] }, emptyUsage("explain", JUDGE_MODEL, false));
    expect(result.explanation).toBe(passing);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("retries once, then templates an explanation missing the required Tier", async () => {
    const { explainAndQuote } = await import("./explain");
    parse.mockResolvedValue(answer("Food is pleasant. Confidence is Low."));
    const result = await explainAndQuote({ name: "Test", formatName: "tasca", rollup: computed(), candidates: [] }, emptyUsage("explain", JUDGE_MODEL, false));
    expect(parse).toHaveBeenCalledTimes(2);
    expect(result.explanation).toMatch(/\*\*(Avoid|OK|Good|Must Go|Life Changing)\*\*/);
    expect(result.explanation).toMatch(/provisional/i);
    expect(result.explanation).toMatch(/Confidence: Low/i);
  });

  it("regenerates a peer explanation that omits its comparison level", async () => {
    const { explainAndQuote } = await import("./explain");
    const { TIER_LABEL } = await import("@/domain/aspects");
    const r = computed();
    r.provisional = false;
    r.peerSnapshot = { id: 3, month: "2026-09", publishedAt: now.toISOString() };
    r.compositeStanding = { level: "city", key: "Lisbon", peerCount: 40, percentile: 62 };
    r.standings = r.contributions.slice(0, 2).map(({ input }) => ({ input, theta: 1, percentile: 63, level: "family" as const, key: "traditional_portuguese", peerCount: 35 }));
    const tier = TIER_LABEL[r.tier!];
    const deciding = (await import("@/domain/aspects")).INPUT_LABEL[r.contributions[0]!.input];
    parse.mockResolvedValueOnce(answer(`**${tier}** is based on ${deciding}. Confidence is Low.`));
    const passing = `**${tier}** is compared with all Lisbon Peers and Format family traditional portuguese Peers, led by ${deciding}. Confidence is Low because the bootstrap is uncertain.`;
    parse.mockResolvedValueOnce(answer(passing));
    const result = await explainAndQuote({ name: "Test", formatName: "tasca", rollup: r, candidates: [] }, emptyUsage("explain", JUDGE_MODEL, false));
    expect(result.explanation).toBe(passing);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("templates forced Avoid and Not enough evidence with a missed bar", async () => {
    const { explainAndQuote } = await import("./explain");
    parse.mockResolvedValue(answer("Invalid."));
    const forced = computed();
    forced.tier = "avoid";
    forced.redFlags = [{ group: "health", incidents12m: 2, newestAt: "2026-08-01T00:00:00Z", shareOfText12m: 0.125, forcesAvoid: true, types: ["hygiene"] }];
    const avoid = await explainAndQuote({ name: "Test", formatName: "tasca", rollup: forced, candidates: [] }, emptyUsage("explain", JUDGE_MODEL, false));
    expect(avoid.explanation).toMatch(/\*\*Avoid\*\*.*provisional/i);
    expect(avoid.explanation).toMatch(/health.*2.*2026-08/i);
    expect(avoid.explanation).toMatch(/forces Avoid/i);
    const thin = computed();
    thin.state = "not_enough_evidence";
    thin.tier = null;
    thin.notEnoughEvidence.missed = ["fewer than 15 Reviews with text"];
    const insufficient = await explainAndQuote({ name: "Test", formatName: "tasca", rollup: thin, candidates: [] }, emptyUsage("explain", JUDGE_MODEL, false));
    expect(insufficient.explanation).toMatch(/Not enough evidence.*fewer than 15 Reviews with text/i);
  });
});
