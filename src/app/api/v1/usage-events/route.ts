import { apiJsonResponse, routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireCallerApi, withApiErrors } from "@/lib/problem";
import { recordUsageEvent } from "@/lib/usage-events";

export const POST = withApiErrors(async (request: Request) => {
  const caller = await requireCallerApi(request, "invitee");
  if (caller.role !== "invitee") throw new ApiError(403, "forbidden", "Only an Invitee can record usage events");
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const input = parseApiRequest(routes.recordUsageEvent.request.body, body);
  await recordUsageEvent(caller.userId, input.eventKey, input.type);
  return apiJsonResponse(routes.recordUsageEvent.responses[201], 201, { recorded: true });
});
