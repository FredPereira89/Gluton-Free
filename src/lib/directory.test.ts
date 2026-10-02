import { describe, expect, it } from "vitest";
import { directoryQuerySchema, parseDirectoryQuery, type DirectoryQuery } from "./api-contract";
import { buildDirectory, type DirectoryRow } from "./directory";

let seq = 0;
function row(overrides: Partial<DirectoryRow> = {}): DirectoryRow {
  seq += 1;
  return {
    slug: `r-${seq}`, name: `Restaurant ${seq}`, address: null, area: "Alfama", lat: null, lng: null,
    format: "tasca", priceTier: "€€", state: "verdict", tier: "good", confidence: "medium", provisional: false,
    foodPercentile: 50, valuePercentile: 50, trend: null, googlePlaceId: `ChIJ${seq}abcd`, theForkUrl: null,
    ...overrides,
  };
}
const query = (overrides: Partial<DirectoryQuery> = {}): DirectoryQuery => ({ ...directoryQuerySchema.parse({}), ...overrides });
const names = (rows: DirectoryRow[], overrides: Partial<DirectoryQuery> = {}) => buildDirectory(rows, query(overrides)).items.map((item) => item.name);

describe("directory", () => {
  it("lists each Restaurant with what a reader needs to shortlist it", () => {
    const result = buildDirectory([
      row({ slug: "cantina", name: "Cantina", tier: "must_go", confidence: "high", format: "cafe_pastelaria", priceTier: "€", area: "Chiado", theForkUrl: "https://www.thefork.pt/restaurante/cantina-r9?cc=1" }),
    ], query());
    expect(result.items).toEqual([{
      slug: "cantina", name: "Cantina", state: "verdict", tier: "must_go", provisional: false, confidence: "high",
      format: "Café & pastelaria", formatFamily: "quick_cafe", priceTier: "€", neighbourhood: "Chiado", trend: null,
      dietaryFits: [], reason: null, standoutDish: null,
      booking: { label: "Book on TheFork", url: "https://www.thefork.pt/restaurante/cantina-r9", kind: "thefork" },
    }]);
  });

  it("carries each Restaurant's Trend through to its row, empty where the rule hid it", () => {
    const result = buildDirectory([row({ name: "Up", trend: "improving" }), row({ name: "Down", trend: "slipping" }), row({ name: "Flat", trend: "steady" }), row({ name: "Hidden", trend: null })], query({ sort: "name" }));
    expect(Object.fromEntries(result.items.map((item) => [item.name, item.trend]))).toEqual({ Up: "improving", Down: "slipping", Flat: "steady", Hidden: null });
  });

  it("hides Not enough evidence Restaurants by default and shows them on request", () => {
    const rows = [
      row({ name: "Judged" }),
      row({ name: "Thin", state: "not_enough_evidence", tier: null, confidence: null }),
    ];
    const hidden = buildDirectory(rows, query());
    expect(hidden.items.map((item) => item.name)).toEqual(["Judged"]);
    expect(hidden.total).toBe(1);
    expect(hidden.hiddenNotEnoughEvidence).toBe(1);

    const shown = buildDirectory(rows, query({ nee: true }));
    expect(shown.items.map((item) => item.name)).toEqual(["Judged", "Thin"]);
    expect(shown.items[1]).toMatchObject({ state: "not_enough_evidence", tier: null, confidence: null });
    expect(shown.hiddenNotEnoughEvidence).toBe(0);
  });

  it("sorts by Tier by default, then Confidence, then name", () => {
    expect(names([
      row({ name: "Good low", tier: "good", confidence: "low" }),
      row({ name: "Life", tier: "life_changing", confidence: "low" }),
      row({ name: "Good high B", tier: "good", confidence: "high" }),
      row({ name: "Good high A", tier: "good", confidence: "high" }),
      row({ name: "Avoid", tier: "avoid", confidence: "high" }),
      row({ name: "Must", tier: "must_go", confidence: "medium" }),
    ])).toEqual(["Life", "Must", "Good high A", "Good high B", "Good low", "Avoid"]);
  });
});

describe("directory sorting", () => {
  const rows = () => [
    row({ name: "Beta", tier: "good", foodPercentile: 90, valuePercentile: 10, priceTier: "€€€" }),
    row({ name: "Alfa", tier: "must_go", foodPercentile: 40, valuePercentile: 80, priceTier: "€" }),
    row({ name: "Gama", tier: "ok", foodPercentile: null, valuePercentile: null, priceTier: null }),
    row({ name: "Delta", tier: "good", foodPercentile: 70, valuePercentile: 60, priceTier: "€€" }),
  ];

  it("sorts by Food standing, best first, unranked last", () => {
    expect(names(rows(), { sort: "food" })).toEqual(["Beta", "Delta", "Alfa", "Gama"]);
  });
  it("sorts by Value standing, best first, unranked last", () => {
    expect(names(rows(), { sort: "value" })).toEqual(["Alfa", "Delta", "Beta", "Gama"]);
  });
  it("sorts by Price, cheapest first, unpriced last", () => {
    expect(names(rows(), { sort: "price" })).toEqual(["Alfa", "Delta", "Beta", "Gama"]);
  });
  it("sorts by name, ignoring accents and case, whatever the Tier", () => {
    expect(names([row({ name: "Ézio", tier: "avoid" }), row({ name: "zé", tier: "life_changing" }), row({ name: "Abel" }), row({ name: "ana", tier: "ok" })], { sort: "name" })).toEqual(["Abel", "ana", "Ézio", "zé"]);
  });
});

describe("directory filters, search and paging", () => {
  const rows = () => [
    row({ name: "Tasca do Zé", tier: "good", format: "tasca", priceTier: "€", area: "Alfama" }),
    row({ name: "Café Central", tier: "ok", format: "cafe_pastelaria", priceTier: "€", area: "Chiado" }),
    row({ name: "Belcanto", tier: "life_changing", format: "fine_dining", priceTier: "€€€€", area: "Chiado" }),
    row({ name: "Marisqueira Rio", tier: "must_go", format: "marisqueira_cervejaria", priceTier: "€€€", area: "Alfama" }),
    row({ name: "Thin", state: "not_enough_evidence", tier: null, confidence: null, format: "tasca", priceTier: "€", area: "Alfama" }),
  ];

  it("filters by Tier, any of those chosen", () => {
    expect(names(rows(), { tier: ["good", "ok"] })).toEqual(["Tasca do Zé", "Café Central"]);
  });
  it("filters by Format family, grouping the formats that belong to it", () => {
    expect(names(rows(), { family: ["traditional_portuguese"] })).toEqual(["Marisqueira Rio", "Tasca do Zé"]);
  });
  it("filters by Price tier", () => {
    expect(names(rows(), { price: ["€"] })).toEqual(["Tasca do Zé", "Café Central"]);
  });
  it("filters by neighbourhood", () => {
    expect(names(rows(), { area: ["Chiado"] })).toEqual(["Belcanto", "Café Central"]);
  });
  it("combines filters: all kinds must match", () => {
    expect(names(rows(), { area: ["Alfama"], price: ["€"], tier: ["good"] })).toEqual(["Tasca do Zé"]);
  });
  it("keeps Not enough evidence out of a Tier filter's way: shown only when asked", () => {
    expect(names(rows(), { price: ["€"], nee: true })).toEqual(["Tasca do Zé", "Café Central", "Thin"]);
  });
  it("searches by name, ignoring accents and case, and combines with filters", () => {
    expect(names(rows(), { q: "CAFE" })).toEqual(["Café Central"]);
    expect(names(rows(), { q: "ri", area: ["Alfama"] })).toEqual(["Marisqueira Rio"]);
  });
  it("searches the neighbourhood and Format label too", () => {
    expect(names(rows(), { q: "chiado" })).toEqual(["Belcanto", "Café Central"]);
    expect(names(rows(), { q: "fine dining" })).toEqual(["Belcanto"]);
  });
  it("does not narrow by a pasted link or ID, which is for starting a lookup", () => {
    expect(names(rows(), { q: "https://www.google.com/maps/place/Foo" }).length).toBe(4);
  });
  it("counts the Not enough evidence Restaurants the filters would show but are hidden", () => {
    expect(buildDirectory(rows(), query({ area: ["Alfama"] })).hiddenNotEnoughEvidence).toBe(1);
    expect(buildDirectory(rows(), query({ area: ["Chiado"] })).hiddenNotEnoughEvidence).toBe(0);
  });
  it("lists every neighbourhood with its count, whatever else is filtered, most Restaurants first", () => {
    const result = buildDirectory(rows(), query({ tier: ["good"] }));
    expect(result.neighbourhoods).toEqual([{ name: "Alfama", count: 2 }, { name: "Chiado", count: 2 }]);
  });
  it("pages the result and clamps a page past the end", () => {
    const many = Array.from({ length: 5 }, (_, i) => row({ name: `Place ${i}`, tier: "good" }));
    const second = buildDirectory(many, query({ pageSize: 2, page: 2 }));
    expect(second).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(second.items.map((item) => item.name)).toEqual(["Place 2", "Place 3"]);
    expect(buildDirectory(many, query({ pageSize: 2, page: 99 })).page).toBe(3);
    expect(buildDirectory([], query())).toMatchObject({ items: [], total: 0, totalPages: 1, page: 1 });
  });
});

describe("directory URL state", () => {
  it("reads search, sort, filters and page from URL parameters, repeating a parameter to pick several values", () => {
    const parsed = parseDirectoryQuery(new URLSearchParams("q=taberna&sort=food&tier=good&tier=must_go&family=casual&price=%E2%82%AC%E2%82%AC&area=Alfama&nee=1&page=2"));
    expect(parsed).toEqual({
      q: "taberna", sort: "food", tier: ["good", "must_go"], family: ["casual"], price: ["€€"], area: ["Alfama"],
      diet: [], nee: true, page: 2, pageSize: 24,
    });
  });

  it("keeps a long pasted link as the search text, as long as the lookup input allows", () => {
    const link = `https://www.google.com/maps/place/${"a".repeat(1500)}`;
    expect(parseDirectoryQuery(new URLSearchParams({ q: link })).q).toBe(link);
    expect(() => parseDirectoryQuery(new URLSearchParams({ q: "a".repeat(2049) }))).toThrow();
  });

  it("reads nee=true like nee=1", () => {
    expect(parseDirectoryQuery(new URLSearchParams("nee=true")).nee).toBe(true);
    expect(parseDirectoryQuery(new URLSearchParams("nee=0")).nee).toBe(false);
  });

  it("has defaults for an empty URL", () => {
    expect(parseDirectoryQuery(new URLSearchParams())).toEqual({
      q: "", sort: "tier", tier: [], family: [], price: [], area: [], diet: [], nee: false, page: 1, pageSize: 24,
    });
  });

  it.each(["sort=vibes", "tier=gold", "family=bistro", "price=%24", "nee=maybe", "page=0", "page=abc", "pageSize=1000"])("rejects %s", (search) => {
    expect(() => parseDirectoryQuery(new URLSearchParams(search))).toThrow();
  });
});

it("combines Dietary fit with search and other filters before pagination", () => {
  const rows = [row({ name: "Vegan tasca", dietaryFits: ["vegan", "vegetarian"] }), row({ name: "Other tasca", dietaryFits: [] })];
  expect(names(rows, { diet: ["vegan"], q: "tasca", area: ["Alfama"], pageSize: 1 })).toEqual(["Vegan tasca"]);
});
