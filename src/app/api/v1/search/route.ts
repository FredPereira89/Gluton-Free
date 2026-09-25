import { apiJsonResponse, routes, searchQuerySchema, type SearchResponse } from "@/lib/api-contract";
import { ApiError, parseApiRequest, withApiErrors } from "@/lib/problem";
import { searchGoogleMaps, type MapsSearchItem } from "@/ingest/dataforseo";
import { searchKnownRestaurants } from "@/web/data";

const LISBON = { lat: 38.7223, lng: -9.1393 };

function distanceMeters(from: { lat: number; lng: number }, item: MapsSearchItem): number | null {
  if (typeof item.latitude !== "number" || typeof item.longitude !== "number") return null;
  const radians = Math.PI / 180;
  const a = Math.sin((item.latitude - from.lat) * radians / 2) ** 2
    + Math.cos(from.lat * radians) * Math.cos(item.latitude * radians)
    * Math.sin((item.longitude - from.lng) * radians / 2) ** 2;
  return Math.round(12_742_000 * Math.asin(Math.min(1, Math.sqrt(a))));
}

function status(item: MapsSearchItem): SearchResponse["candidates"][number]["status"] | "permanently_closed" {
  const value = item.work_hours?.current_status?.toLowerCase();
  if (value === "closed_forever" || value === "permanently_closed") return "permanently_closed";
  if (value === "temporarily_closed") return "temporarily_closed";
  if (value === "close" || value === "closed") return "closed";
  return value === "open" ? "open" : "unknown";
}

const priceTiers: Record<string, SearchResponse["candidates"][number]["priceTier"]> = {
  inexpensive: "€", moderate: "€€", expensive: "€€€", very_expensive: "€€€€",
};

export const GET = withApiErrors(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const wire = parseApiRequest(routes.search.request.query, {
    q: params.get("q") ?? "", near: params.get("near") ?? undefined,
  });
  const coordinates = wire.near?.split(",");
  if (coordinates && (coordinates.length !== 2 || coordinates.some((part) => !part?.trim()))) {
    throw new ApiError(400, "invalid_request", "Invalid request");
  }
  const query = parseApiRequest(searchQuerySchema, {
    q: wire.q,
    near: coordinates ? { lat: Number(coordinates[0]), lng: Number(coordinates[1]) } : undefined,
  });
  if (!query.q) return apiJsonResponse(routes.search.responses[200], 200, { known: [], candidates: [] });

  const near = query.near ? { lat: Number(query.near.lat.toFixed(7)), lng: Number(query.near.lng.toFixed(7)) } : LISBON;
  const items = await searchGoogleMaps(query.q, near);
  const knownRows = await searchKnownRestaurants(query.q, items.map((item) => item.place_id).filter((id): id is string => !!id));
  const knownIds = new Set(knownRows.map((row) => row.placeId).filter(Boolean));
  const visible = items.filter((item) => item.type === "maps_search" && item.place_id && item.title && status(item) !== "permanently_closed");
  const names = new Map<string, Set<string>>();
  const addName = (name: string, id: string) => {
    const key = name.trim().toLocaleLowerCase();
    if (!names.has(key)) names.set(key, new Set());
    names.get(key)!.add(id);
  };
  for (const row of knownRows) {
    addName(row.name, row.placeId ?? row.slug);
  }
  for (const item of visible) {
    addName(item.title!, item.place_id!);
  }
  const seen = new Set<string>();
  const candidates: SearchResponse["candidates"] = [];
  for (const item of visible) {
    const placeId = item.place_id!;
    if (knownIds.has(placeId) || seen.has(placeId)) continue;
    seen.add(placeId);
    const category = item.category ?? null;
    const categoryText = [category, ...(item.category_ids ?? [])].join(" ").toLocaleLowerCase();
    const warnings: SearchResponse["candidates"][number]["warnings"] = [];
    if ((names.get(item.title!.trim().toLocaleLowerCase())?.size ?? 0) > 1) warnings.push("same_name");
    const city = item.address_info?.city?.trim().toLocaleLowerCase();
    if (city && city !== "lisbon" && city !== "lisboa") warnings.push("outside_lisbon");
    if (/\b(bar|cafe|café|coffee|pub|tavern)\b/i.test(categoryText)) warnings.push("maybe_not_restaurant");
    candidates.push({
      placeId, name: item.title!, address: item.address ?? null, distanceMeters: distanceMeters(near, item),
      stars: item.rating?.value ?? null, reviewCount: item.rating?.votes_count ?? null,
      category, priceTier: priceTiers[item.price_level ?? ""] ?? null, status: status(item) as SearchResponse["candidates"][number]["status"], warnings,
    });
  }
  const known = knownRows.map(({ placeId: _placeId, ...row }) => row);
  return apiJsonResponse(routes.search.responses[200], 200, { known, candidates });
});
