import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RestaurantListPage from "./page";
import { listRestaurants } from "@/web/data";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/web/data", () => ({ listRestaurants: vi.fn() }));

describe("Restaurant list screen", () => {
  it("links to each Restaurant and lets the owner reach the next page", async () => {
    vi.mocked(listRestaurants).mockResolvedValueOnce({
      items: [
        { slug: "o-velho-eurico", name: "O Velho Eurico", city: "Lisbon", area: "Mouraria", state: "verdict", tier: "good" },
        { slug: "second", name: "Second", city: "Lisbon", area: null, state: "not_enough_evidence", tier: null },
      ],
      nextCursor: "2",
    });

    const html = renderToStaticMarkup(await RestaurantListPage({ searchParams: Promise.resolve({ limit: "2" }) }));
    expect(html).toContain('href="/r/o-velho-eurico"');
    expect(html).toContain("O Velho Eurico");
    expect(html).toContain("Mouraria");
    expect(html).toContain("Good");
    expect(html).toContain("Not enough evidence");
    expect(html).toContain('href="/restaurants?cursor=2&amp;limit=2"');
    expect(listRestaurants).toHaveBeenCalledWith({ cursor: undefined, limit: 2 });
  });
});
