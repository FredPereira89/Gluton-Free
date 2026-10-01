// Where a reader goes to book: TheFork when the Restaurant has a TheFork Listing, otherwise Google
// Maps. Shared by the directory and the report. Never carries affiliate or tracking parameters.
export type BookingLink = { label: string; url: string; kind: "thefork" | "google_maps" };

function plainWebUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

export function bookingLink(restaurant: { name: string; googlePlaceId: string | null; theForkUrl: string | null }): BookingLink {
  const theFork = plainWebUrl(restaurant.theForkUrl);
  if (theFork) return { label: "Book on TheFork", url: theFork, kind: "thefork" };
  const params = new URLSearchParams({ api: "1", query: restaurant.googlePlaceId ? restaurant.name : `${restaurant.name} Lisboa` });
  if (restaurant.googlePlaceId) params.set("query_place_id", restaurant.googlePlaceId);
  return { label: "Open in Google Maps", url: `https://www.google.com/maps/search/?${params}`, kind: "google_maps" };
}
