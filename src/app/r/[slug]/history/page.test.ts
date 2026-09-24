import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import VerdictHistoryPage from "./page";
import { loadVerdictHistory } from "@/web/data";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/web/data", () => ({ loadVerdictHistory: vi.fn() }));

describe("Verdict history screen", () => {
  it("lists each Verdict with its date, Tier, Confidence, provisional flag and Peer snapshot", async () => {
    vi.mocked(loadVerdictHistory).mockResolvedValueOnce({
      restaurant: { slug: "o-velho-eurico", name: "O Velho Eurico" },
      items: [
        { id: 9, issuedAt: "2026-11-01T09:00:00.000Z", state: "verdict", tier: "good", confidence: "medium", provisional: false, peerSnapshotId: 3 },
        { id: 4, issuedAt: "2026-09-24T12:00:00.000Z", state: "not_enough_evidence", tier: null, confidence: "low", provisional: true, peerSnapshotId: null },
      ],
      nextCursor: "4",
    });

    const html = renderToStaticMarkup(await VerdictHistoryPage({
      params: Promise.resolve({ slug: "o-velho-eurico" }),
      searchParams: Promise.resolve({ limit: "2" }),
    }));

    expect(html).toContain("O Velho Eurico");
    expect(html).toContain('href="/r/o-velho-eurico"');
    expect(html).toContain("1 Nov 2026");
    expect(html).toContain("Good");
    expect(html).toContain("Medium Confidence");
    expect(html).toContain("Peer snapshot #3");
    expect(html).toContain("24 Sept 2026");
    expect(html).toContain("Not enough evidence");
    expect(html).toContain("Provisional");
    expect(html).toContain('href="/r/o-velho-eurico/history?cursor=4&amp;limit=2"');
    expect(loadVerdictHistory).toHaveBeenCalledWith("o-velho-eurico", { cursor: undefined, limit: 2 });
  });
});
