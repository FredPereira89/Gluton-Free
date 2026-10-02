import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DirectoryItem, DirectoryResponse } from "@/lib/api-contract";
import { loadCompareEvidence, loadDirectory } from "@/web/data";
import ComparePage from "./page";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/page-role", () => ({ pageRole: vi.fn().mockResolvedValue("owner") }));
vi.mock("@/web/data", () => ({ loadDirectory: vi.fn(), loadCompareEvidence: vi.fn() }));
vi.mock("@/web/shortlist", () => ({ CompareRemove: ({ name }: { name: string }) => `Remove ${name}` }));

function item(slug: string, overrides: Partial<DirectoryItem> = {}): DirectoryItem {
  return {
    slug, name: slug, state: "verdict", tier: "good", provisional: false, confidence: "high",
    format: "Tasca", formatFamily: "traditional_portuguese", priceTier: "€", neighbourhood: "Alfama",
    trend: null, dietaryFits: [], reason: "Reviewers keep coming back.", standoutDish: null,
    booking: { label: "Open in Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${slug}`, kind: "google_maps" },
    ...overrides,
  };
}

function directory(items: DirectoryItem[]): DirectoryResponse {
  return { items, page: 1, pageSize: 3, total: items.length, totalPages: 1, hiddenNotEnoughEvidence: 0, neighbourhoods: [] };
}

describe("Compare", () => {
  it("aligns facts in shortlist order, explains mixed Formats, and shows Report themes with reviewer counts", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([
      item("alpha"), item("beta", { format: "Snacks & street food" }), item("gamma"),
    ]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({
      beta: { strengths: [{ label: "Attentive service", reviewers: 8 }], warnings: [{ label: "Long waits", reviewers: 3 }], redFlags: [], forcesAvoid: false, gapReason: null },
      alpha: { strengths: [], warnings: [], redFlags: [], forcesAvoid: false, gapReason: null },
      gamma: { strengths: [], warnings: [], redFlags: [], forcesAvoid: false, gapReason: null },
    });
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["beta", "alpha", "gamma"] }) }));
    const head = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(head.indexOf("beta")).toBeLessThan(head.indexOf("alpha"));
    expect(head.indexOf("alpha")).toBeLessThan(head.indexOf("gamma"));
    expect(head).not.toContain("Open in Google Maps");
    expect(html.match(/<tr class="compare-action-row">[\s\S]*?<\/tr>/)?.[0]).toContain("Open in Google Maps");
    expect(html).toContain('scope="row"');
    expect(html).toContain("Different Formats.");
    expect(html).toContain("8 reviewers");
    expect(html).toContain("3 reviewers");
    expect(html).toContain("No recurring praise yet");
    expect(vi.mocked(loadCompareEvidence)).toHaveBeenCalledWith(["beta", "alpha", "gamma"]);
  });

  it("keeps the comparison when one Restaurant has no Tier or theme evidence", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([
      item("alpha"), item("thin", { state: "not_enough_evidence", tier: null, confidence: null, reason: null }), item("gamma"),
    ]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({});
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["alpha", "thin", "gamma"] }) }));
    expect(html).toContain("Not enough evidence");
    expect(html).toContain("No recurring criticism");
    expect(html).not.toContain("Different Formats.");
    expect(html).toContain("Restaurant comparison");
  });

  it("repeats Restaurant names at each group of facts, hidden from assistive tech", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([item("alpha"), item("beta")]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({});
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["alpha", "beta"] }) }));
    const groups = html.match(/<tr class="compare-group" aria-hidden="true">[\s\S]*?<\/tr>/g) ?? [];
    expect(groups).toHaveLength(2);
    for (const group of groups) expect(group).toMatch(/alpha[\s\S]*beta/);
  });

  it("keeps booking secondary for a forced Avoid and for missing evidence, and puts the red flag in Why", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([
      item("fine"),
      item("forced", { tier: "avoid", reason: "Several diners report food poisoning" }),
      item("thin", { state: "not_enough_evidence", tier: null, confidence: null, reason: null }),
    ]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({
      forced: { strengths: [], warnings: [], redFlags: ["Several diners report food poisoning"], forcesAvoid: true, gapReason: null },
      thin: { strengths: [], warnings: [], redFlags: ["Hygiene complaints"], forcesAvoid: false, gapReason: "Needs a review from the last 18 months; the newest is 30 months old" },
    });
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["fine", "forced", "thin"] }) }));
    expect(html.match(/compare-book-secondary/g)).toHaveLength(2);
    const why = html.match(/<tr class=""><th scope="row" class="compare-row-label">Why<\/th>[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(why).toContain("compare-flag-tag");
    expect(why).toContain("the newest is 30 months old");
    expect(why).toContain("Hygiene complaints");
    expect(html).not.toContain("Not enough Reviews yet");
  });

  it("falls back to a neutral reason when no evidence gap is recorded", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([
      item("alpha"), item("thin", { state: "not_enough_evidence", tier: null, confidence: null, reason: null }),
    ]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({});
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["alpha", "thin"] }) }));
    expect(html).toContain("The available Reviews do not support a Verdict.");
  });

  it("always renders the swipe hint; CSS decides when the table overflows", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([item("alpha"), item("beta")]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({});
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["alpha", "beta"] }) }));
    expect(html).toContain('class="compare-swipe-hint small" data-count="2"');
  });
});
