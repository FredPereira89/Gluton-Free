import { describe, expect, it } from "vitest";
import { INPUTS, type Aspect } from "@/domain/aspects";
import { assertSnapshotSize, buildPeerSnapshot, peerSnapshotBytes, type PeerCandidate } from "./snapshot-build";
import type { RollupReview } from "./rollup";

const NOW = new Date("2026-09-15T00:00:00Z");
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 30.4375 * 24 * 3600 * 1000);

let nextId = 1;
function textReview(food: number | null, p: { exceptional?: RollupReview["exceptional"]; publishedAt?: Date } = {}): RollupReview {
  return {
    id: nextId++, source: "google", publishedAt: p.publishedAt ?? NOW, stars: null, hasText: true, subRatings: null,
    aspects: { food, service: null, ambience: null, value: null, wait: null, consistency: null } as Record<Aspect, number | null>,
    exceptional: p.exceptional ?? "none", themes: [],
  };
}

/** 16 text Reviews, half scoring `hi` on food and half `lo` (mean (hi+lo)/2, population variance ((hi-lo)/2)²). */
function halfAndHalf(hi: number, lo: number, exceptionalCount = 0): RollupReview[] {
  return Array.from({ length: 16 }, (_, i) => textReview(i < 8 ? hi : lo, { exceptional: i < exceptionalCount ? "food" : "none" }));
}

let nextRestaurant = 1;
function peer(p: Partial<PeerCandidate> & { reviews: RollupReview[] }): PeerCandidate {
  return { id: nextRestaurant++, city: "Lisbon", format: "casual_contemporary", status: "open", ...p };
}

describe("buildPeerSnapshot: membership", () => {
  it("keeps Restaurants meeting the Not-enough-evidence bar and drops closed ones and those below it", () => {
    const qualifies = peer({ reviews: halfAndHalf(2, 0) });
    const tooFewReviews = peer({ reviews: halfAndHalf(2, 0).slice(0, 10) });
    const closed = peer({ status: "permanently_closed", reviews: halfAndHalf(2, 0) });
    const temporarilyClosed = peer({ status: "temporarily_closed", reviews: halfAndHalf(2, 0) });
    const tooStale = peer({ reviews: halfAndHalf(2, 0).map((r) => ({ ...r, publishedAt: monthsAgo(20) })) });
    const noFoodMentions = peer({ reviews: Array.from({ length: 16 }, (_, i) => textReview(i < 7 ? 1 : null)) });

    const snapshot = buildPeerSnapshot([qualifies, tooFewReviews, closed, temporarilyClosed, tooStale, noFoodMentions], NOW);

    expect(snapshot.members.map((m) => m.restaurantId).sort()).toEqual([qualifies.id, temporarilyClosed.id].sort());
    expect(snapshot.month).toBe("2026-09");
  });
});

describe("buildPeerSnapshot: Change points", () => {
  it("judges a looked-up Restaurant on Reviews since its own confirmed Change point, so it can leave the Peers", () => {
    const old = halfAndHalf(2, 0).map((r) => ({ ...r, publishedAt: monthsAgo(6) }));
    const withoutChange = peer({ reviews: old });
    const afterChange = peer({ reviews: old, changePointAt: monthsAgo(2) });

    const snapshot = buildPeerSnapshot([withoutChange, afterChange], NOW);

    expect(snapshot.members.map((m) => m.restaurantId)).toEqual([withoutChange.id]);
  });
});

describe("buildPeerSnapshot: group stats", () => {
  // Four Casual contemporary Peers. Food scores: two Peers average +1 (8×2, 8×0), two average 0 (8×1, 8×-1),
  // each with 16 Reviews at full recency weight, so every hand figure below follows from the raw means.
  const fourPeers = () => [
    peer({ reviews: halfAndHalf(2, 0, 0) }),
    peer({ reviews: halfAndHalf(2, 0, 4) }),
    peer({ reviews: halfAndHalf(1, -1, 0) }),
    peer({ reviews: halfAndHalf(1, -1, 4) }),
  ];
  const food = (snapshot: ReturnType<typeof buildPeerSnapshot>, level: string, key: string) =>
    snapshot.groups.find((g) => g.level === level && g.key === key && g.input === "food")!;

  it("builds a stat row per level, key and input with the Peer count", () => {
    const snapshot = buildPeerSnapshot(fourPeers(), NOW);

    expect(snapshot.groups).toHaveLength(3 * INPUTS.length);
    expect(snapshot.groups.filter((g) => g.input === "food").map((g) => [g.level, g.key, g.city, g.peerCount])).toEqual([
      ["format", "casual_contemporary", "Lisbon", 4],
      ["family", "casual", "Lisbon", 4],
      ["city", "Lisbon", "Lisbon", 4],
    ]);
  });

  it("fits k by empirical Bayes and sorts θ, built from raw weighted means", () => {
    const group = food(buildPeerSnapshot(fourPeers(), NOW), "format", "casual_contemporary");

    // Raw means {1, 1, 0, 0} → Format mean 0.5. Between-Peer variance 1/3; each Peer's sampling variance
    // is (16/15)/16 = 1/15, so τ² = 4/15 and k = σ²/τ² = (16/15)/(4/15) = 4.
    expect(group.formatMean).toBeCloseTo(0.5, 10);
    expect(group.k).toBeCloseTo(4, 6);
    // θ = (16·mean + 4·0.5) / 20 → 0.9 for the +1 Peers, 0.1 for the 0 Peers.
    expect(group.sortedTheta).toEqual([0.1, 0.1, 0.9, 0.9]);
  });

  it("leaves an input nobody mentions at θ = Format mean 0 with the default k", () => {
    const service = buildPeerSnapshot(fourPeers(), NOW).groups.find((g) => g.level === "city" && g.input === "service")!;

    expect(service).toMatchObject({ sortedTheta: [0, 0, 0, 0], formatMean: 0, k: 10 });
  });

  it("ranks each Peer's composite among its group with the ADR 0002 weights", () => {
    const group = food(buildPeerSnapshot(fourPeers(), NOW), "format", "casual_contemporary");

    // Food percentile 25 or 75; the other five inputs tie at P50 (weight 60/90). Composite = 30/90·food + 60/90·50.
    expect(group.composite).toHaveLength(4);
    [41.6667, 41.6667, 58.3333, 58.3333].forEach((expected, i) => expect(group.composite[i]).toBeCloseTo(expected, 3));
  });

  it("fits the exceptional-language Beta prior to Peers by moments", () => {
    const { exceptionalPrior } = food(buildPeerSnapshot(fourPeers(), NOW), "format", "casual_contemporary");

    // Shares {0, ¼, 0, ¼} of 16 trials each: m = 1/8, ρ = 43/315, α+β = 1/ρ − 1 = 272/43.
    expect(exceptionalPrior.alpha).toBeCloseTo(34 / 43, 6);
    expect(exceptionalPrior.beta).toBeCloseTo(238 / 43, 6);
  });
});

describe("buildPeerSnapshot: size", () => {
  // Distinct, pseudo-random per-Peer Reviews across every input so no array compresses by repetition.
  function scatteredPeers(count: number): PeerCandidate[] {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const formats = ["tasca", "casual_contemporary", "fine_dining", "cafe_pastelaria"];
    return Array.from({ length: count }, (_, i) => {
      const score = () => Math.round(rand() * 4 - 2);
      const reviews = Array.from({ length: 30 }, () => ({
        ...textReview(score(), { exceptional: rand() < 0.1 ? "food" : "none" }),
        stars: Math.ceil(rand() * 5),
        aspects: { food: score(), service: score(), ambience: score(), value: score(), wait: score(), consistency: null } as Record<Aspect, number | null>,
      }));
      return peer({ format: formats[i % formats.length]!, reviews });
    });
  }

  it("keeps a Lisbon-scale snapshot under 1 MB", () => {
    const snapshot = buildPeerSnapshot(scatteredPeers(3000), NOW);

    expect(snapshot.members).toHaveLength(3000);
    expect(peerSnapshotBytes(snapshot)).toBeLessThan(1_000_000);
  });

  it("refuses a snapshot over the size limit", () => {
    const snapshot = buildPeerSnapshot(scatteredPeers(200), NOW);

    expect(() => assertSnapshotSize(snapshot, peerSnapshotBytes(snapshot) - 1)).toThrow(/exceeds/);
    expect(() => assertSnapshotSize(snapshot, peerSnapshotBytes(snapshot))).not.toThrow();
  });
});
