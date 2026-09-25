import { describe, expect, it } from "vitest";
import { betaQuantile, exceptionalPosterior, regularizedIncompleteBeta } from "./beta";

describe("regularizedIncompleteBeta", () => {
  it("is 0 at x=0 and 1 at x=1", () => {
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
  });
  it("matches the uniform CDF for Beta(1,1)", () => {
    expect(regularizedIncompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 10);
    expect(regularizedIncompleteBeta(0.75, 1, 1)).toBeCloseTo(0.75, 10);
  });
  it("is symmetric for Beta(a,a) around x=0.5", () => {
    expect(regularizedIncompleteBeta(0.5, 4, 4)).toBeCloseTo(0.5, 10);
  });
  it("matches a known Beta(2,3) value", () => {
    // CDF of Beta(2,3) at 0.4 = 1 - (1-x)^3 * (1 + 3x) = 0.5248
    expect(regularizedIncompleteBeta(0.4, 2, 3)).toBeCloseTo(0.5248, 6);
  });
});

describe("betaQuantile", () => {
  it("inverts regularizedIncompleteBeta", () => {
    const q = betaQuantile(0.9, 5, 20);
    expect(regularizedIncompleteBeta(q, 5, 20)).toBeCloseTo(0.9, 8);
  });
  it("is the midpoint for a symmetric Beta at p=0.5", () => {
    expect(betaQuantile(0.5, 3, 3)).toBeCloseTo(0.5, 8);
  });
  it("returns 0 and 1 at the extremes", () => {
    expect(betaQuantile(0, 2, 2)).toBe(0);
    expect(betaQuantile(1, 2, 2)).toBe(1);
  });
});

describe("exceptionalPosterior", () => {
  const prior = { alpha: 5, beta: 45 }; // peer group centred near a 10% exceptional share
  it("is exactly 0.10 with no evidence beyond the prior itself", () => {
    // With zero trials the posterior equals the prior, whose P(> its own P90) is 10% by definition.
    expect(exceptionalPosterior(0, 0, prior)).toBeCloseTo(0.1, 8);
  });
  it("rises toward 1 as the observed exceptional share climbs well past the Peer P90", () => {
    expect(exceptionalPosterior(40, 50, prior)).toBeGreaterThan(0.99);
  });
  it("stays low when the observed share sits at or below the Peer group's typical rate", () => {
    expect(exceptionalPosterior(5, 50, prior)).toBeLessThan(0.5);
  });
  it("is monotone increasing in the number of successes at a fixed trial count", () => {
    const low = exceptionalPosterior(10, 50, prior);
    const high = exceptionalPosterior(20, 50, prior);
    expect(high).toBeGreaterThan(low);
  });
});
