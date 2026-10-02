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
      beta: { strengths: [{ label: "Attentive service", reviewers: 8 }], warnings: [{ label: "Long waits", reviewers: 3 }], redFlags: [] },
      alpha: { strengths: [], warnings: [], redFlags: [] },
      gamma: { strengths: [], warnings: [], redFlags: [] },
    });
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["beta", "alpha", "gamma"] }) }));
    const head = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(head.indexOf("beta")).toBeLessThan(head.indexOf("alpha"));
    expect(head.indexOf("alpha")).toBeLessThan(head.indexOf("gamma"));
    expect(html).toContain('scope="row"');
    expect(html).toContain("Different Formats.");
    expect(html).toContain("8 reviewers");
    expect(html).toContain("3 reviewers");
    expect(html).toContain("No recurring praise yet");
    expect(vi.mocked(loadCompareEvidence)).toHaveBeenCalledWith(["beta", "alpha", "gamma"]);
  });

  it("keeps the comparison when one Restaurant has no Tier or theme evidence", async () => {
    vi.mocked(loadDirectory).mockResolvedValue(directory([
      item("alpha"), item("thin", { state: "not_enough_evidence", tier: null, confidence: null, reason: null }),
    ]));
    vi.mocked(loadCompareEvidence).mockResolvedValue({});
    const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ r: ["alpha", "thin"] }) }));
    expect(html).toContain("Not enough evidence");
    expect(html).toContain("No recurring criticism");
    expect(html).not.toContain("Different Formats.");
    expect(html).toContain("Restaurant comparison");
  });
});
