import { describe, expect, it } from "vitest";
import { directoryQuerySchema, parseDirectoryQuery } from "./api-contract";
import { directoryHref, directoryQueryFromPage, safeDirectoryReturn, safeReportReturn, shortlistDirectoryReturn } from "./directory-url";
import { comparisonHref } from "./shortlist";

const base = directoryQuerySchema.parse({});

describe("directory URL", () => {
  it("leaves out everything at its default, so the plain home URL is the default view", () => {
    expect(directoryHref(base)).toBe("/");
  });

  it("writes search, sort, filters, the toggle and the page, and reads them back", () => {
    const query = { ...base, q: "café", sort: "value" as const, tier: ["good" as const, "must_go" as const], family: ["casual" as const], price: ["€€" as const], area: ["Santos & Madragoa"], diet: ["vegan" as const, "gluten_free" as const], nee: true, page: 3 };
    const href = directoryHref(query);
    expect(href.startsWith("/?")).toBe(true);
    expect(parseDirectoryQuery(new URLSearchParams(href.slice(2)))).toEqual(query);
  });

  it("changing the search, a filter or the sort goes back to the first page", () => {
    expect(directoryHref({ ...base, page: 4, sort: "name" }, { resetPage: true })).toBe("/?sort=name");
  });

  it("reads page-style search params, and falls back to the default view for a bad URL", () => {
    expect(directoryQueryFromPage({ q: "tasca", tier: ["good", "ok"], nee: "1" })).toMatchObject({ q: "tasca", tier: ["good", "ok"], nee: true });
    expect(directoryQueryFromPage({ sort: "vibes" })).toEqual(base);
    expect(directoryQueryFromPage({})).toEqual(base);
  });
});

describe("report return links", () => {
  it("preserves search, repeated filters, sort and pagination through Directory, Compare and Report", () => {
    const results = directoryHref({ ...base, q: "tasca", sort: "value", tier: ["good", "must_go"], area: ["Alfama"], page: 3 });
    const directory = new URL(results, "https://app.local");
    const comparison = comparisonHref(["alpha", "beta"], shortlistDirectoryReturn(directory.pathname, directory.searchParams));
    const compare = new URL(comparison, "https://app.local");
    expect(safeDirectoryReturn(compare.searchParams.get("from") ?? undefined)).toBe(results);

    for (const from of [results, comparison]) {
      const reportParams = new URLSearchParams({ from });
      const nextComparison = new URL(comparisonHref(["alpha", "gamma"], shortlistDirectoryReturn("/r/alpha", reportParams)), "https://app.local");
      expect(safeDirectoryReturn(nextComparison.searchParams.get("from") ?? undefined)).toBe(results);
    }
  });

  it("does not use an unsafe or unrelated Report return as the shortlist destination", () => {
    for (const from of ["https://evil.example/", "//evil.example", "/settings", "/compare?r=a&from=https%3A%2F%2Fevil.example"]) {
      expect(shortlistDirectoryReturn("/r/alpha", new URLSearchParams({ from }))).toBe("/");
    }
    expect(shortlistDirectoryReturn("/settings", new URLSearchParams({ from: "/?tier=good" }))).toBe("/");
  });

  it("lets a Report return to a canonical directory or comparison and nowhere else", () => {
    expect(safeReportReturn("/?tier=good")).toBe("/?tier=good");
    expect(safeReportReturn("/compare?r=a&r=b")).toBe("/compare?r=a&r=b");
    expect(safeReportReturn("/compare?r=a&r=b&from=%2F%3Fsort%3Dname")).toBe("/compare?r=a&r=b&from=%2F%3Fsort%3Dname");
    for (const unsafe of ["https://evil.example/", "//evil.example", "/settings", "/compare?r=../x", "/compare", "/\evil", undefined]) {
      expect(safeReportReturn(unsafe), String(unsafe)).toBe("/");
    }
  });

  it("returns a comparison's own way back only to the directory", () => {
    expect(safeReportReturn("/compare?r=a&r=b&from=%2Fsettings")).toBe("/compare?r=a&r=b");
    expect(safeDirectoryReturn("/compare?r=a")).toBe("/");
  });
});
