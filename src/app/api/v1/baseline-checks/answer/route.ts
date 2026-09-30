import { answerSpotCheck } from "@/lib/baseline-spot-check";
import { apiJsonResponse, routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { id, agreed } = parseApiRequest(routes.answerBaselineSpotCheck.request.body, body);
  await answerSpotCheck(id, agreed);
  return apiJsonResponse(routes.answerBaselineSpotCheck.responses[200], 200, { saved: true });
});
