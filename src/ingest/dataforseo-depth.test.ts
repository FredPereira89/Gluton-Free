import { describe, expect, it } from "vitest";
import { LOOKUP_FETCH_DEPTH_CAP, lookupDepthFor } from "./dataforseo";

describe("lookupDepthFor", () => {
  it("fetches every Review of a small Listing, rounded up to the billing unit", () => {
    expect(lookupDepthFor(0)).toBe(20);
    expect(lookupDepthFor(60)).toBe(80);
  });

  it("never goes past the cap, however many Reviews the Listing has", () => {
    expect(lookupDepthFor(1859)).toBe(LOOKUP_FETCH_DEPTH_CAP);
    expect(lookupDepthFor(50_000)).toBe(LOOKUP_FETCH_DEPTH_CAP);
  });
});
