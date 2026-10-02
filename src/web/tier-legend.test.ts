import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TIER_MEANING } from "@/domain/aspects";
import { TierLegend } from "./tier-legend";

describe("Tier legend (issue #119)", () => {
  it("gives each Tier its plain meaning, from Life Changing down to Avoid", () => {
    const html = renderToStaticMarkup(createElement(TierLegend));
    const order = ["Life Changing", "Must Go", "Good", "OK", "Avoid"].map((label) => html.indexOf(`>${label}<`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Among the very best of its kind in Lisbon, worth planning a trip around");
    expect(html).toContain("Clearly better than most of its kind");
    expect(html).toContain("Solid choice for its kind");
    expect(html).toContain("Fine if convenient");
    expect(html).toContain("Reviewers report real problems");
  });

  it("is a collapsed disclosure so it stays out of the way", () => {
    const html = renderToStaticMarkup(createElement(TierLegend));
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("What do the Tiers mean?");
  });

  it("has a meaning for every Tier", () => {
    expect(Object.keys(TIER_MEANING).sort()).toEqual(["avoid", "good", "life_changing", "must_go", "ok"]);
  });
});
