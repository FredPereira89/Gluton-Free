import { createHash } from "node:crypto";
import { routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, problemResponse, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { updateRestaurantFacts } from "@/lib/restaurant-facts-owner";
import { loadRestaurantBundle } from "@/web/data";

export const GET = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = parseApiRequest(routes.restaurantBundle.request.params, await params);
  const bundle = await loadRestaurantBundle(slug);
  if (!bundle) return problemResponse({ status: 404, code: "not_found", message: "Restaurant not found" });
  const body = JSON.stringify(routes.restaurantBundle.responses[200].parse(bundle));
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  const headers = { "Cache-Control": "private, no-cache", ETag: etag };
  if (request.headers.get("if-none-match")?.split(",").some((tag) => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
});

export const PATCH = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.updateRestaurantFacts.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const update = parseApiRequest(routes.updateRestaurantFacts.request.body, body);
  return updateRestaurantFacts(slug, update);
});
