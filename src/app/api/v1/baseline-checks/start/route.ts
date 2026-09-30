import { startSpotCheck } from "@/lib/baseline-spot-check";
import { apiJsonResponse, routes } from "@/lib/api-contract";
import { requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  await startSpotCheck();
  return apiJsonResponse(routes.startBaselineSpotCheck.responses[200], 200, { started: true });
});
