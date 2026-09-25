import { apiJsonResponse, routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { markVerdictSeen } from "@/web/data";

export const PUT = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.markSeen.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { verdictId } = parseApiRequest(routes.markSeen.request.body, body);
  const seen = await markVerdictSeen(slug, verdictId);
  if (!seen) throw new ApiError(404, "not_found", "Restaurant or Verdict not found");
  return apiJsonResponse(routes.markSeen.responses[200], 200, { seen: true });
});
