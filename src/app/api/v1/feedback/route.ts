import { apiJsonResponse, routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireCallerApi, withApiErrors } from "@/lib/problem";
import { saveGeneralFeedback } from "@/lib/general-feedback";

export const POST = withApiErrors(async (request: Request) => {
  const caller = await requireCallerApi(request, "invitee");
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const input = parseApiRequest(routes.submitFeedback.request.body, body);
  const saved = await saveGeneralFeedback(caller.userId, caller.role, input);
  if (!saved) throw new ApiError(404, "not_found", "Restaurant not found");
  return apiJsonResponse(routes.submitFeedback.responses[201], 201, { saved: true });
});
