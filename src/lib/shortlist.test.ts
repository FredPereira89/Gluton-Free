import { describe, expect, it } from "vitest";
import { SHORTLIST_LIMIT, comparisonHref, shortlistNames, shortlistSlugs, slugLabel } from "./shortlist";

describe("shortlist", () => {
  it("keeps valid slugs once each, in the order chosen, up to the limit", () => {
    expect(shortlistSlugs(["a", "b", "a", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(SHORTLIST_LIMIT).toBe(3);
  });

  it("drops anything that is not a slug, so untrusted storage or URL text cannot reach a query", () => {
    expect(shortlistSlugs(["Café", "../x", "a b", "", 5, null, { slug: "a" }, "ok-1"])).toEqual(["ok-1"]);
    expect(shortlistSlugs(["-start", "a".repeat(121)])).toEqual([]);
  });

  it("keeps names only for held slugs, and falls back to the slug when a name is missing", () => {
    expect(shortlistNames({ a: " Casa A ", b: 5, z: "Gone" }, ["a", "b"])).toEqual({ a: "Casa A" });
    expect(shortlistNames("nope", ["a"])).toEqual({});
    expect(shortlistNames(["a"], ["a"])).toEqual({});
    expect(slugLabel("casa-do-alentejo")).toBe("casa do alentejo");
  });

  it("writes a comparison URL, leaving out the default way back", () => {
    expect(comparisonHref(["a", "b"])).toBe("/compare?r=a&r=b");
    expect(comparisonHref(["a", "b"], "/")).toBe("/compare?r=a&r=b");
    expect(comparisonHref(["a", "b"], "/?tier=good")).toBe("/compare?r=a&r=b&from=%2F%3Ftier%3Dgood");
  });
});
