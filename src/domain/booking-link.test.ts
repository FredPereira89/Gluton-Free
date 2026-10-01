import { describe, expect, it } from "vitest";
import { bookingLink } from "./booking-link";

describe("booking link", () => {
  it("books on TheFork when the Restaurant has a TheFork Listing", () => {
    expect(bookingLink({ name: "Taberna", googlePlaceId: "ChIJabc12", theForkUrl: "https://www.thefork.pt/restaurante/taberna-r123" }))
      .toEqual({ label: "Book on TheFork", url: "https://www.thefork.pt/restaurante/taberna-r123", kind: "thefork" });
  });

  it("strips tracking and affiliate parameters from the TheFork link", () => {
    const link = bookingLink({
      name: "Taberna", googlePlaceId: null,
      theForkUrl: "https://www.thefork.pt/restaurante/taberna-r123?cc=12345&utm_source=aff&ref=x#reviews",
    });
    expect(link.url).toBe("https://www.thefork.pt/restaurante/taberna-r123");
  });

  it("otherwise opens Google Maps by place ID, not the Restaurant's own website", () => {
    const link = bookingLink({ name: "Casa & Filhos", googlePlaceId: "ChIJabc12", theForkUrl: null });
    expect(link.label).toBe("Open in Google Maps");
    expect(link.kind).toBe("google_maps");
    const url = new URL(link.url);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect([...url.searchParams.keys()].sort()).toEqual(["api", "query", "query_place_id"]);
    expect(url.searchParams.get("query")).toBe("Casa & Filhos");
    expect(url.searchParams.get("query_place_id")).toBe("ChIJabc12");
  });

  it("falls back to a Maps search by name when there is no place ID", () => {
    const link = bookingLink({ name: "Taberna", googlePlaceId: null, theForkUrl: null });
    expect(new URL(link.url).searchParams.get("query")).toBe("Taberna Lisboa");
    expect(new URL(link.url).searchParams.has("query_place_id")).toBe(false);
  });

  it("ignores a TheFork URL that is not a web link", () => {
    expect(bookingLink({ name: "Taberna", googlePlaceId: null, theForkUrl: "javascript:alert(1)" }).kind).toBe("google_maps");
  });
});
