import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { RollupSchema } from "./blocks";
import {
  aspectStandings, changePointNotice, confidenceReasons, consistencyLine, heroReason, missingEvidence,
  peerGroupName, provisionalNotice, redFlagLine, standingLevel, standingPhrase, strengthsAndWarnings,
} from "./plain-report";

type Rollup = z.infer<typeof RollupSchema>;
const ctx = { format: "restaurante_tradicional", city: "Lisbon" };

const standing = (input: Rollup["inputs"][number]["input"], percentile: number, level: "format" | "family" | "city" = "format") => ({
  input, theta: 0.9, percentile, level, key: level === "city" ? "Lisbon" : level === "family" ? "traditional_portuguese" : "restaurante_tradicional", peerCount: 40,
});
const base = (over: Partial<Rollup> = {}): Rollup => ({
  ruleVersion: "t", provisional: false, state: "verdict", tier: "good", composite: 0.5,
  inputs: (["food", "service", "overall", "value", "ambience", "wait"] as const).map((input) => ({ input, counted: true, weight: 1, theta: 0.5, nEff: 20, n: 20, sumW: 20 })),
  contributions: [], floorCap: null, redFlags: [], themes: [], themeBase: { analysed: 100, windowMonths: 24 },
  notEnoughEvidence: { textReviews: 80, foodMentions: 40, newestAgeMonths: 1, missed: [] },
  confidence: { level: "high", bootstrapShare: 0.9, caps: [] },
  consistencySpread: { sd: 0.4, n: 50, windowMonths: 24 },
  counts: { reviews: 100, textReviews: 80, ratingOnly: 20, analysed: 80, perSource: {} },
  series: [],
  standings: [standing("food", 80), standing("service", 50), standing("overall", 95), standing("value", 20), standing("ambience", 50), standing("wait", 50)],
  ...over,
} as Rollup);

describe("standingPhrase", () => {
  it.each([[95, "better than almost all"], [80, "better than most"], [50, "about typical for"], [20, "weaker than most"], [5, "weaker than almost all"]])(
    "P%i reads %s", (p, words) => expect(standingPhrase(p)).toBe(words));
});

describe("standingLevel", () => {
  it.each([[95, 5], [80, 4], [50, 3], [20, 2], [5, 1]])("P%i is level %i", (p, level) => expect(standingLevel(p)).toBe(level));
});

describe("peerGroupName", () => {
  it("names the Format level with its plural and the city", () => {
    expect(peerGroupName({ level: "format", key: "restaurante_tradicional" }, ctx)).toBe("traditional restaurants in Lisbon");
    expect(peerGroupName({ level: "format", key: "tasca" }, { ...ctx, format: "tasca" })).toBe("tascas in Lisbon");
  });
  it("names the family and city levels", () => {
    expect(peerGroupName({ level: "family", key: "traditional_portuguese" }, ctx)).toBe("traditional Portuguese restaurants in Lisbon");
    expect(peerGroupName({ level: "city", key: "Lisbon" }, ctx)).toBe("restaurants in Lisbon");
  });
});

describe("heroReason", () => {
  it("leads with the best-standing counted Aspect, food first on a tie", () => {
    expect(heroReason(base(), ctx)).toBe("Better food than most traditional restaurants in Lisbon");
  });
  it("skips the Overall stars input in favour of an Aspect", () => {
    expect(heroReason(base({ standings: [standing("overall", 99), standing("service", 80)] }), ctx)).toBe("Better service than most traditional restaurants in Lisbon");
  });
  it("calls Life Changing among the very best", () => {
    expect(heroReason(base({ tier: "life_changing" }), ctx)).toBe("Among the very best traditional restaurants in Lisbon");
  });
  it("says OK is fine if convenient", () => {
    expect(heroReason(base({ tier: "ok", standings: [standing("food", 50)] }), ctx)).toBe("Fine if convenient: about typical for traditional restaurants in Lisbon");
  });
  it("words an Avoid by reviewer reports when red flags force it", () => {
    const flags = [{ group: "health" as const, incidents12m: 4, newestAt: null, shareOfText12m: 0.1, forcesAvoid: true, types: ["food_poisoning" as const] }];
    expect(heroReason(base({ tier: "avoid", redFlags: flags }), ctx)).toBe("4 recent reviews report food poisoning");
  });
  it("words an ordinary Avoid by comparison", () => {
    expect(heroReason(base({ tier: "avoid", standings: [standing("food", 8)] }), ctx)).toBe("Weaker than almost all traditional restaurants in Lisbon");
  });
  it("has a generic reason when there are no Peer standings", () => {
    expect(heroReason(base({ standings: undefined, tier: "good" }), ctx)).toBe("Reviewers rate it well");
    expect(heroReason(base({ standings: undefined, tier: "ok" }), ctx)).toBe("Reviewers rate it as fine");
    expect(heroReason(base({ standings: undefined, tier: "avoid" }), ctx)).toBe("Reviewers rate it poorly");
  });
  it("never leaks θ, P-numbers or snapshots", () => {
    expect(heroReason(base(), ctx)).not.toMatch(/θ|\bP\d|snapshot|\bSD\b/);
  });
});

describe("aspectStandings", () => {
  it("states each counted Aspect in words, in input order, skipping Overall stars", () => {
    const lines = aspectStandings(base(), ctx);
    expect(lines[0]).toEqual({ input: "food", label: "Food", text: "better than most traditional restaurants in Lisbon", phrase: "better than most", level: 4, group: "traditional restaurants in Lisbon" });
    expect(lines.map((l) => l.label)).toEqual(["Food", "Service", "Value", "Ambience", "Wait time"]);
    expect(lines.find((l) => l.label === "Value")!.text).toBe("weaker than most traditional restaurants in Lisbon");
  });
  it("leaves out inputs that are not counted", () => {
    const r = base();
    r.inputs = r.inputs.map((i) => (i.input === "ambience" ? { ...i, counted: false } : i));
    expect(aspectStandings(r, ctx).map((l) => l.label)).not.toContain("Ambience");
  });
  it("is empty without Peer standings", () => {
    expect(aspectStandings(base({ standings: undefined }), ctx)).toEqual([]);
  });
});

describe("strengthsAndWarnings", () => {
  const themes = [
    { code: "food_delicious", aspect: "food", polarity: 1, count: 30, share: 0.3 },
    { code: "service_slow", aspect: "service", polarity: -1, count: 12, share: 0.12 },
    { code: "service_warm", aspect: "service", polarity: 1, count: 20, share: 0.2 },
    { code: "food_fresh", aspect: "food", polarity: 1, count: 10, share: 0.1 },
    { code: "food_generous_portions", aspect: "food", polarity: 1, count: 8, share: 0.08 },
    { code: "food_small_portions", aspect: "food", polarity: -1, count: 1, share: 0.01 },
  ] as Rollup["themes"];
  it("keeps the top 3 of each with how many reviewers raise them", () => {
    const { strengths, warnings } = strengthsAndWarnings(base({ themes }));
    expect(strengths).toEqual([
      { label: "Delicious food", reviewers: 30, text: "30 reviewers" },
      { label: "Warm, friendly staff", reviewers: 20, text: "20 reviewers" },
      { label: "Fresh ingredients", reviewers: 10, text: "10 reviewers" },
    ]);
    expect(warnings.map((w) => w.label)).toEqual(["Slow service", "Small portions"]);
    expect(warnings[1]!.text).toBe("1 reviewer");
  });
});

describe("redFlagLine", () => {
  const g = (over = {}) => ({ group: "health" as const, incidents12m: 4, newestAt: null, shareOfText12m: 0.1, forcesAvoid: true, types: ["food_poisoning" as const], ...over });
  it("words it as what reviewers report", () => {
    expect(redFlagLine(g())).toBe("4 recent reviews report food poisoning");
    expect(redFlagLine(g({ incidents12m: 1 }))).toBe("1 recent review reports food poisoning");
  });
  it("lists several kinds", () => {
    expect(redFlagLine(g({ types: ["food_poisoning", "hygiene"] }))).toBe("4 recent reviews report food poisoning and poor hygiene");
    expect(redFlagLine(g({ group: "money", types: ["scam_overcharge"] }))).toBe("4 recent reviews report overcharging");
  });
});

describe("notices", () => {
  it("words Provisional plainly", () => expect(provisionalNotice()).toBe("Early verdict: fewer comparisons yet"));
  it("words a Change point with the date and what it means", () => {
    expect(changePointNotice(base({ changePointAt: "2026-03-10T00:00:00.000Z", changePointDescription: "New chef" })))
      .toBe("New chef since Mar 2026: only reviews since then count");
  });
  it("falls back when the Change point has no description", () => {
    expect(changePointNotice(base({ changePointAt: "2026-03-10T00:00:00.000Z" }))).toBe("A change since Mar 2026: only reviews since then count");
  });
  it("is null without a Change point", () => expect(changePointNotice(base())).toBeNull());
});

describe("missingEvidence", () => {
  it("says what is missing, only for unmet bars", () => {
    const nee = { textReviews: 12, foodMentions: 9, newestAgeMonths: 30, missed: [], bars: {
      textReviews: { have: 12, need: 15, met: false }, foodMentions: { have: 9, need: 8, met: true }, newestReview: { have: 30, need: 18, met: false },
    } };
    expect(missingEvidence(nee)).toEqual([
      "Needs at least 15 reviews with written text; has 12",
      "Needs a review from the last 18 months; the newest is 30 months old",
    ]);
  });
  it("handles no reviews at all and falls back to the thresholds without bars", () => {
    const out = missingEvidence({ textReviews: 0, foodMentions: 0, newestAgeMonths: null, missed: [] });
    expect(out).toEqual([
      "Needs at least 15 reviews with written text; has 0",
      "Needs at least 8 reviews that talk about the food; has 0",
      "Needs a review from the last 18 months; there are none",
    ]);
  });
});

describe("confidenceReasons", () => {
  it("translates known reasons and drops unknown or number-laden ones", () => {
    const caps = [
      "only one Crowd Source",
      "fewer than 5 Reviews with text in the last 12 months",
      "Sources disagree by 33 points (google: P72, tripadvisor: P39)",
      "text and stars disagree by 30 points (text: P80, stars: P50)",
      "provisional: judged against default cut-offs, not Peers",
      "a Crowd Source failed: tripadvisor",
      "something new we never mapped, θ = 0.8",
    ];
    const out = confidenceReasons(caps);
    expect(out).toHaveLength(6);
    expect(out.join(" ")).not.toMatch(/θ|\bP\d|Peer|Crowd Source/);
  });
});

describe("consistencyLine", () => {
  it("describes spread in words with no SD", () => {
    expect(consistencyLine({ sd: 0.3, n: 40, windowMonths: 24 })).toBe("Reviewers mostly agree (40 reviews, last 24 months)");
    expect(consistencyLine({ sd: 0.8, n: 40, windowMonths: 24 })).toBe("Reviewers' experiences vary somewhat (40 reviews, last 24 months)");
    expect(consistencyLine({ sd: 1.3, n: 40, windowMonths: 24 })).toBe("Reviewers' experiences vary a lot (40 reviews, last 24 months)");
    expect(consistencyLine({ sd: null, n: 1, windowMonths: 24 })).toBeNull();
  });
});
