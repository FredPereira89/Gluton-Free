import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { directoryQuerySchema, type DirectoryItem, type DirectoryResponse } from "@/lib/api-contract";
import Directory from "./directory";

vi.mock("./directory-controls", () => ({ default: () => createElement("div", null, "Controls") }));

const item = (overrides: Partial<DirectoryItem> = {}): DirectoryItem => ({
  slug: "cantina", name: "Cantina Zé", state: "verdict", tier: "must_go", provisional: false, confidence: "high",
  format: "Casa de fado", formatFamily: "traditional_portuguese", priceTier: "€€", neighbourhood: "Alfama", trend: null,
  dietaryFits: [], reason: null, standoutDish: null,
  booking: { label: "Open in Google Maps", url: "https://www.google.com/maps/search/?api=1&query=Cantina", kind: "google_maps" },
  ...overrides,
});
const result = (overrides: Partial<DirectoryResponse> = {}): DirectoryResponse => ({
  items: [item()], page: 1, pageSize: 24, total: 1, totalPages: 1, hiddenNotEnoughEvidence: 0, neighbourhoods: [], ...overrides,
});
const render = (response: DirectoryResponse, query: Parameters<typeof directoryQuerySchema.parse>[0] = {}) =>
  renderToStaticMarkup(createElement(Directory, { query: directoryQuerySchema.parse(query), result: response }));

describe("directory", () => {
  it("shows the one-line reason and Standout dish under the name, and nothing when there is no Verdict", () => {
    const html = render(result({ items: [
      item({ reason: "Better food than most tascas in Lisbon", standoutDish: "Arroz de tamboril" }),
      item({ slug: "novo", name: "Novo Lugar", state: "not_enough_evidence", tier: null, confidence: null }),
    ] }));
    expect(html).toContain("Better food than most tascas in Lisbon");
    expect(html).toContain("Known for Arroz de tamboril");
    expect(html.match(/line-reason/g)).toHaveLength(1);
  });

  it("heads each Tier course once when sorted by Tier, and not under any other sort", () => {
    const items = [
      item({ slug: "a", tier: "must_go" }), item({ slug: "b", tier: "must_go" }), item({ slug: "c", tier: "good" }),
      item({ slug: "n", state: "not_enough_evidence", tier: null, confidence: null }),
    ];
    const byTier = render(result({ items }), { sort: "tier" });
    expect(byTier.match(/ementa-course/g)).toHaveLength(3);
    expect(byTier).toContain(">Not enough evidence</span>");
    expect(render(result({ items }), { sort: "name" })).not.toContain("ementa-course");
  });

  it("shows each Restaurant's Tier, Confidence, Format label, Price, neighbourhood and booking link", () => {
    const html = render(result());
    expect(html).toContain('href="/r/cantina?from=%2F"');
    expect(html).toContain("Cantina Zé");
    expect(html).toContain("Must Go");
    expect(html).toContain("High Confidence");
    expect(html).toContain("Casa de fado");
    expect(html).not.toContain("casa_de_fado");
    expect(html).toContain("€€");
    expect(html).toContain("Alfama");
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=Cantina"');
    expect(html).toContain("Open in Google Maps");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps the Trend off the row, which carries only the Verdict, Confidence and reason (the Report and Compare show it)", () => {
    for (const trend of ["improving", "steady", "slipping"] as const) {
      expect(render(result({ items: [item({ trend })] }))).not.toContain(`trend-${trend}`);
    }
  });

  it("labels a Not enough evidence Restaurant instead of showing a Tier", () => {
    const html = render(result({ items: [item({ state: "not_enough_evidence", tier: null, confidence: null })] }), { nee: true });
    expect(html).toContain("Not enough evidence");
    expect(html).not.toContain("conf-");
  });

  it("offers a link to show hidden Not enough evidence Restaurants", () => {
    expect(render(result({ hiddenNotEnoughEvidence: 10 }))).toContain("Show 10 with Not enough evidence");
    expect(render(result({ hiddenNotEnoughEvidence: 0 }))).not.toContain("Show 0 with Not enough evidence");
  });

  it("links the previous and next page, keeping the rest of the view in the URL", () => {
    const html = render(result({ page: 2, totalPages: 3 }), { q: "tasca", sort: "value", page: 2 });
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain('href="/?q=tasca&amp;sort=value"'); // previous: page 1 is the plain URL
    expect(html).toContain('href="/?q=tasca&amp;sort=value&amp;page=3"');
    expect(render(result())).not.toContain("Page 1 of 1");
  });

  it("offers the Tier legend (issue #119)", () => {
    const html = render(result());
    expect(html).toContain("What do the Tiers mean?");
    expect(html).toContain("Among the very best of its kind in Lisbon, worth planning a trip around");
  });

  it("offers Clear filters when nothing matches", () => {
    const html = render(result({ items: [], total: 0 }), { tier: ["avoid"] });
    expect(html).toContain("No Restaurants match");
    expect(html).toContain('href="/"');
    expect(html).toContain("Clear filters");
  });
});

it("shows accessible Dietary fit icons and clears an empty dietary filter", () => {
  const html = render(result({ items: [item({ dietaryFits: ["vegan", "gluten_free"] })] }));
  expect(html).toContain('title="Vegan"'); expect(html).toContain('title="Gluten-free"');
  expect(render(result({ items: [], total: 0 }), { diet: ["vegan"] })).toContain("Clear filters");
});
