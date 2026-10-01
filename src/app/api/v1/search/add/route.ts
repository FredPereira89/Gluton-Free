import {
  apiJsonResponse, routes, searchAddBodySchema, type SearchResponse,
} from "@/lib/api-contract";
import { sourcePriceTier } from "@/domain/restaurant-facts";
import { googleBusinessByReference, searchGoogleMaps, type MapsSearchItem } from "@/ingest/dataforseo";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { recordSearchCost, spendCapStatus } from "@/lib/spend-cap";
import { searchKnownRestaurants } from "@/web/data";
import { normaliseName, sameRestaurantName, searchInput } from "../input";
import { LISBON } from "../shared";

const CITY_ZOOM = 12;

function distanceMeters(from: { lat: number; lng: number }, item: MapsSearchItem): number | null {
  if (typeof item.latitude !== "number" || typeof item.longitude !== "number") return null;
  const radians = Math.PI / 180;
  const a = Math.sin((item.latitude - from.lat) * radians / 2) ** 2
    + Math.cos(from.lat * radians) * Math.cos(item.latitude * radians)
    * Math.sin((item.longitude - from.lng) * radians / 2) ** 2;
  return Math.round(12_742_000 * Math.asin(Math.min(1, Math.sqrt(a))));
}

function status(item: MapsSearchItem): SearchResponse["candidates"][number]["status"] | "permanently_closed" {
  const value = (item.work_hours?.current_status ?? item.work_time?.work_hours?.current_status)?.toLowerCase();
  if (value === "closed_forever" || value === "permanently_closed") return "permanently_closed";
  if (value === "temporarily_closed") return "temporarily_closed";
  if (value === "close" || value === "closed") return "closed";
  return value === "open" || value === "opened" ? "open" : "unknown";
}

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { q } = parseApiRequest(searchAddBodySchema, body);
  if (!q) throw new ApiError(400, "invalid_request", "Search query is required");

  const cap = await spendCapStatus();
  if (cap.atCap) throw new ApiError(429, "spend_cap_reached", "Daily vendor spend cap reached", { resetAt: cap.resetAt });

  const input = await searchInput(q, { resolveShortLinks: true });
  if (input.kind === "invalid") return apiJsonResponse(routes.searchAdd.responses[200], 200, {
    known: [], candidates: [], recognised: null,
    message: "Link not recognised. Paste a Google Maps, Tripadvisor or TheFork Restaurant link.",
  });
  if ((input.kind === "name" || input.kind === "link_name") && input.value.length > 120) {
    throw new ApiError(400, "invalid_request", "Restaurant name is too long");
  }

  let items: MapsSearchItem[] = [];
  let cost = 0;
  const isGoogleReference = input.kind === "place_id" || input.kind === "cid";
  if (isGoogleReference) {
    const result = await googleBusinessByReference(
      `${input.kind === "cid" ? "cid" : "place_id"}:${input.value}`, LISBON,
    );
    cost = result.cost;
    if (result.item) items = [result.item];
  } else {
    const query = input.value;
    const result = await searchGoogleMaps(query, LISBON, input.kind === "name" ? CITY_ZOOM : undefined);
    cost = result?.cost ?? 0;
    items = result?.items ?? [];
    if (input.kind === "link_name") {
      items = items.filter((item) => item.type === "maps_search" && item.title && sameRestaurantName(item.title, input.value));
    }
  }
  await recordSearchCost(cost);

  const query = input.kind === "name" || input.kind === "link_name" ? input.value : "";
  const ids = items.map((item) => item.place_id).filter((id): id is string => !!id);
  if (input.kind === "place_id" && !ids.includes(input.value)) ids.push(input.value);
  const knownRows = await searchKnownRestaurants(query, ids);
  const knownIds = new Set(knownRows.map((row) => row.placeId).filter((id): id is string => !!id));

  const names = new Map<string, Set<string>>();
  const addName = (name: string, id: string) => {
    const key = normaliseName(name);
    if (!names.has(key)) names.set(key, new Set());
    names.get(key)!.add(id);
  };
  for (const row of knownRows) addName(row.name, row.placeId ?? row.slug);
  for (const item of items) if (item.title && item.place_id) addName(item.title, item.place_id);

  const candidates: SearchResponse["candidates"] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if ((item.type !== "maps_search" && item.type !== "google_business_info")
      || !item.place_id || !item.title || status(item) === "permanently_closed"
      || knownIds.has(item.place_id) || seen.has(item.place_id)) continue;
    seen.add(item.place_id);
    const category = item.category ?? null;
    const categoryText = normaliseName([category, ...(item.category_ids ?? [])].join(" "));
    const warnings: SearchResponse["candidates"][number]["warnings"] = [];
    if ((names.get(normaliseName(item.title))?.size ?? 0) > 1) warnings.push("same_name");
    const city = item.address_info?.city?.trim().toLocaleLowerCase();
    const clearlyOutside = city ? city !== "lisbon" && city !== "lisboa" : (distanceMeters(LISBON, item) ?? 0) > 12_000;
    if (clearlyOutside) warnings.push("outside_lisbon");
    if (/\b(bar|cafe|coffee|pub|tavern)\b/i.test(categoryText)) warnings.push("maybe_not_restaurant");
    candidates.push({
      placeId: item.place_id, name: item.title, address: item.address ?? null,
      distanceMeters: distanceMeters(LISBON, item), stars: item.rating?.value ?? null,
      reviewCount: item.rating?.votes_count ?? null, category,
      priceTier: sourcePriceTier("google", item.price_level ?? null),
      status: status(item) as SearchResponse["candidates"][number]["status"], warnings,
    });
  }

  const known = knownRows.map(({ placeId: _placeId, ...row }) => row);
  const matchedId = isGoogleReference ? input.value : null;
  const recognised = matchedId
    ? known.find((row) => knownRows.some((saved) => saved.slug === row.slug && saved.placeId === matchedId))
      ?? candidates.find((row) => row.placeId === matchedId) ?? null
    : null;
  return apiJsonResponse(routes.searchAdd.responses[200], 200, {
    known: recognised && "slug" in recognised ? [] : known,
    candidates: recognised && "placeId" in recognised ? [] : candidates,
    recognised,
    message: input.kind === "place_id" && !recognised ? "No Restaurant found for that Google place ID."
      : input.kind === "cid" && !recognised ? "No Restaurant found for that Google Maps link."
      : input.kind === "name" && !known.length && !candidates.length ? "No Restaurants found. Try another spelling, or paste its Google Maps link." : null,
  });
});
