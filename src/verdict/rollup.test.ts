import { describe, expect, it } from "vitest";
import type { Aspect } from "@/domain/aspects";
import { rollup, shrunk, type RollupFlag, type RollupReview } from "./rollup";

const NOW = new Date("2026-09-01T00:00:00Z");
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 30.4375 * 24 * 3600 * 1000);

let nextId = 1;
function review(p: Partial<Omit<RollupReview, "aspects">> & { aspects?: Partial<Record<Aspect, number | null>> | null } = {}): RollupReview {
  const base = { food: null, service: null, ambience: null, value: null, wait: null, consistency: null };
  const hasText = p.hasText ?? p.aspects !== null;
  return {
    id: nextId++,
    source: p.source ?? "google",
    publishedAt: p.publishedAt ?? monthsAgo(1),
    stars: p.stars === undefined ? 5 : p.stars,
    hasText,
    subRatings: p.subRatings ?? null,
    aspects: hasText && p.aspects !== null ? { ...base, ...(p.aspects ?? {}) } : null,
    exceptional: p.exceptional ?? "none",
    themes: p.themes ?? [],
  };
}

function many(n: number, f: (i: number) => RollupReview): RollupReview[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

const great = (i: number, source = i % 2 ? "google" : "tripadvisor") =>
  review({ source, stars: 5, aspects: { food: 2, service: 2, value: 2, wait: 1, consistency: 2, ambience: -1 } });

describe("shrunk", () => {
  it("pulls sparse inputs toward 0 with k = 10", () => {
    expect(shrunk([[1, 2]]).theta).toBeCloseTo(2 / 11);
    expect(shrunk([]).theta).toBe(0);
  });
  it("reports effective n", () => {
    expect(shrunk([[1, 1], [1, 1], [1, 1], [1, 1]]).nEff).toBeCloseTo(4);
    expect(shrunk([[1, 1], [0.25, 1]]).nEff).toBeCloseTo(1.5625 / 1.0625);
  });
});

describe("rollup", () => {
  it("gives Must Go to a consistently excellent Restaurant, ignoring ambience at a tasca", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(200, (i) => great(i)), flags: [] });
    expect(r.state).toBe("verdict");
    expect(r.tier).toBe("must_go");
    expect(r.inputs.find((x) => x.input === "ambience")!.counted).toBe(false);
    expect(r.inputs.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
    expect(r.confidence.level).toBe("low");
  });

  it("counts ambience elsewhere, where a poor room caps Must Go at Good", () => {
    const r = rollup({ now: NOW, format: "restaurant", reviews: many(200, (i) => great(i)), flags: [] });
    expect(r.tier).toBe("good");
    expect(r.floorCap).toMatch(/ambience/);
  });

  it("is Avoid when food is net-negative", () => {
    const reviews = many(40, () => review({ stars: 4, aspects: { food: -1, service: 2 } }));
    expect(rollup({ now: NOW, format: "tasca", reviews, flags: [] }).tier).toBe("avoid");
  });

  it("uses a sub-rating at half weight only where the text left the Aspect empty", () => {
    const withSub = review({ aspects: { food: 2 }, subRatings: { food: 1, service: 5 } });
    const r = rollup({ now: NOW, format: "tasca", reviews: [withSub], flags: [] });
    const food = r.inputs.find((x) => x.input === "food")!;
    const service = r.inputs.find((x) => x.input === "service")!;
    expect(food.n).toBe(1);
    expect(food.theta).toBeGreaterThan(0);
    expect(service.sumW).toBeCloseTo(0.5, 1);
  });

  it("feeds rating-only Reviews into Overall only", () => {
    const ratingOnly = many(10, () => review({ aspects: null, stars: 1, subRatings: { food: 1 } }));
    const r = rollup({ now: NOW, format: "tasca", reviews: ratingOnly, flags: [] });
    expect(r.inputs.find((x) => x.input === "food")!.n).toBe(0);
    expect(r.inputs.find((x) => x.input === "overall")!.n).toBe(10);
    expect(r.counts.ratingOnly).toBe(10);
  });

  it("halves a Review's weight every 18 months", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: [review({ publishedAt: monthsAgo(18), aspects: { food: 1 } })], flags: [] });
    expect(r.inputs.find((x) => x.input === "food")!.sumW).toBeCloseTo(0.5);
  });

  it("reports Not enough evidence with the bar missed", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(10, (i) => great(i)), flags: [] });
    expect(r.state).toBe("not_enough_evidence");
    expect(r.tier).toBeNull();
    expect(r.notEnoughEvidence.missed.join()).toMatch(/15 Reviews with text/);
  });

  it("forces Avoid on two recent confirmed first-hand incidents in one group", () => {
    const reviews = many(100, (i) => great(i));
    const flag = (r: RollupReview, m: number): RollupFlag => ({
      reviewId: r.id,
      type: "food_poisoning",
      group: "health",
      firstHand: true,
      verification: "confirmed",
      publishedAt: monthsAgo(m),
    });
    const r = rollup({ now: NOW, format: "tasca", reviews, flags: [flag(reviews[0]!, 2), flag(reviews[1]!, 8)] });
    expect(r.tier).toBe("avoid");
    expect(r.redFlags[0]!.forcesAvoid).toBe(true);
  });

  it("shows a single incident without forcing Avoid, and ignores unconfirmed ones", () => {
    const reviews = many(100, (i) => great(i));
    const base = { type: "scam_overcharge", group: "money", firstHand: true, publishedAt: monthsAgo(1) } as const;
    const r = rollup({
      now: NOW,
      format: "tasca",
      reviews,
      flags: [
        { ...base, reviewId: reviews[0]!.id, verification: "confirmed" },
        { ...base, reviewId: reviews[1]!.id, verification: "rejected" },
        { ...base, reviewId: reviews[2]!.id, verification: "pending" },
      ],
    });
    expect(r.tier).toBe("must_go");
    expect(r.redFlags).toHaveLength(1);
    expect(r.redFlags[0]!.incidents12m).toBe(1);
    expect(r.redFlags[0]!.forcesAvoid).toBe(false);
  });

  it("caps confidence when only one Crowd Source is present", () => {
    const r = rollup({ now: NOW, format: "tasca", reviews: many(60, (i) => great(i, "google")), flags: [] });
    expect(r.confidence.caps.join()).toMatch(/only one Crowd Source/);
  });

  it("is deterministic", () => {
    const reviews = many(80, (i) => review({ source: i % 2 ? "google" : "tripadvisor", stars: 3 + (i % 3), aspects: { food: (i % 5) - 1 } }));
    const a = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    const b = rollup({ now: NOW, format: "tasca", reviews, flags: [] });
    expect(a).toEqual(b);
  });
});
