import { describe, expect, it } from "vitest";
import { isCrossSite, safeNext } from "./auth-flow";

describe("safeNext", () => {
  it("keeps a same-site path with its query", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("/r/casa?tab=1#top")).toBe("/r/casa?tab=1#top");
  });

  it("falls back to / for anything that could leave the site", () => {
    for (const next of [
      "", "settings", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example",
      "/\r/evil.example", "\t//evil.example",
    ]) expect(safeNext(next), JSON.stringify(next)).toBe("/");
  });
});

describe("isCrossSite", () => {
  const post = (origin?: string) => new Request("https://app.example/api/auth/invite", { method: "POST", headers: origin ? { origin } : {} });
  it("flags only a different Origin", () => {
    expect(isCrossSite(post("https://evil.example"))).toBe(true);
    expect(isCrossSite(post("https://app.example"))).toBe(false);
    expect(isCrossSite(post())).toBe(false);
  });
});
