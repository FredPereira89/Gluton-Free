import { apiJsonResponse, routes, startLookupBodySchema } from "@/lib/api-contract";
import { startLookup } from "@/lib/lookup-start";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const input = parseApiRequest(startLookupBodySchema, body);
  const { jobId, restaurantSlug, created } = await startLookup(input);
  return apiJsonResponse(routes.startLookup.responses[created ? 202 : 200], created ? 202 : 200, { jobId, restaurantSlug });
});
