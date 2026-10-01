import { apiJsonResponse, routes, searchQuerySchema, type SearchResponse } from "@/lib/api-contract";
import { ApiError, parseApiRequest, withApiErrors } from "@/lib/problem";
import { searchKnownRestaurants, type StoredListingReference } from "@/web/data";
import { searchInput } from "./input";

function empty(message: string | null = null): SearchResponse {
  return { known: [], candidates: [], recognised: null, message };
}

export const GET = withApiErrors(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const query = parseApiRequest(searchQuerySchema, { q: params.get("q") ?? "" });
  if (!query.q) return apiJsonResponse(routes.search.responses[200], 200, empty());

  const input = await searchInput(query.q);
  if (input.kind === "name" && input.value.length > 120) throw new ApiError(400, "invalid_request", "Restaurant name is too long");
  if (input.kind === "invalid") return apiJsonResponse(routes.search.responses[200], 200, empty(
    "Link not recognised. Paste a Google Maps, Tripadvisor or TheFork Restaurant link.",
  ));
  if (input.kind === "link_name" && input.value.length > 120) {
    return apiJsonResponse(routes.search.responses[200], 200, empty("Link not recognised. Search by Restaurant name instead."));
  }

  const reference: StoredListingReference | undefined = input.kind === "link_name"
    ? { sourceCode: input.sourceCode, sourceUrl: input.sourceUrl, placeRef: input.placeRef, linkedName: input.value || undefined }
    : input.kind === "cid"
      ? { sourceCode: "google", sourceUrl: input.sourceUrl ?? `https://www.google.com/maps/?cid=${input.value}`, placeRef: input.value }
      : undefined;
  const placeIds = input.kind === "place_id" ? [input.value] : [];
  const knownRows = await searchKnownRestaurants(input.kind === "name" ? input.value : "", placeIds, reference);
  const known = knownRows.map(({ placeId: _placeId, ...row }) => row);

  const isReferenceSearch = input.kind !== "name";
  const recognised = isReferenceSearch && known.length === 1 ? known[0]! : null;
  const results = recognised ? [] : known;
  const message = input.kind === "place_id" && !known.length ? "No Restaurant found for that Google place ID."
    : input.kind === "cid" && !known.length ? "No Restaurant found for that Google Maps link."
    : input.kind === "link_name" && !known.length ? "No Restaurant found for that stored Listing link."
    : input.kind === "name" && !known.length ? "No Restaurants found. Try another spelling, or paste its Google Maps link."
    : null;
  return apiJsonResponse(routes.search.responses[200], 200, {
    known: results, candidates: [], recognised, message,
  });
});
