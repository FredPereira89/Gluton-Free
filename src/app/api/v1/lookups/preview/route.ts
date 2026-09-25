import { apiJsonResponse, previewLookupBodySchema, routes } from "@/lib/api-contract";
import { googleBusinessByReference, postTripadvisorSearch, type GoogleBusinessReference } from "@/ingest/dataforseo";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { recordSearchCost, spendCapStatus } from "@/lib/spend-cap";
import { LISBON } from "../../search/route";
import { searchInput } from "../../search/input";
import { estimateLookup, pollTripadvisorSearch, predictNotEnoughEvidence, proposeGoogleListing, proposeTripadvisorListing } from "./preview";

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { googlePlaceId, sourceUrl } = parseApiRequest(previewLookupBodySchema, body);

  const cap = await spendCapStatus();
  if (cap.atCap) throw new ApiError(429, "spend_cap_reached", "Daily vendor spend cap reached", { resetAt: cap.resetAt });

  let reference: GoogleBusinessReference;
  if (googlePlaceId) {
    reference = `place_id:${googlePlaceId}`;
  } else {
    const input = await searchInput(sourceUrl!);
    if (input.kind === "place_id") reference = `place_id:${input.value}`;
    else if (input.kind === "cid") reference = `cid:${input.value}`;
    else throw new ApiError(400, "invalid_request", "sourceUrl must be a direct Google Maps link or place ID; search by name first");
  }

  const business = await googleBusinessByReference(reference, LISBON);
  await recordSearchCost(business.cost);
  const google = business.item;
  if (!google || !google.place_id) throw new ApiError(404, "not_found", "No Restaurant found for that Google Listing");

  const name = google.title ?? "";
  const googleReviewCount = google.rating?.votes_count ?? null;
  const googleListing = proposeGoogleListing(name, google.place_id, googleReviewCount);

  const task = await postTripadvisorSearch(name);
  const { items, cost } = await pollTripadvisorSearch(task.taskId);
  await recordSearchCost(task.cost + cost);
  const tripadvisorListing = proposeTripadvisorListing(name, items);

  const listings = tripadvisorListing ? [googleListing, tripadvisorListing] : [googleListing];
  return apiJsonResponse(routes.lookupPreview.responses[200], 200, {
    restaurantName: name,
    listings,
    categoryGuess: google.category ?? null,
    estimate: estimateLookup(listings),
    notEnoughEvidenceWarning: predictNotEnoughEvidence(googleReviewCount),
  });
});
