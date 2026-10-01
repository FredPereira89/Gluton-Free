import { apiJsonResponse, routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireCallerApi, withApiErrors } from "@/lib/problem";
import { getVerdictFeedback, saveVerdictFeedback } from "@/lib/verdict-feedback";

type Context = { params: Promise<{ slug: string }> };

export const GET = withApiErrors(async (request: Request, { params }: Context) => {
  const { userId } = await requireCallerApi(request, "invitee");
  const { slug } = parseApiRequest(routes.verdictFeedback.request.params, await params);
  const result = await getVerdictFeedback(userId, slug);
  if (!result.found) throw new ApiError(404, "not_found", "Restaurant not found");
  return apiJsonResponse(routes.verdictFeedback.responses[200], 200, { feedback: result.feedback });
});

export const PUT = withApiErrors(async (request: Request, { params }: Context) => {
  const caller = await requireCallerApi(request, "invitee");
  if (caller.role !== "invitee") throw new ApiError(403, "forbidden", "Only Invitees can give Verdict feedback");
  const { slug } = parseApiRequest(routes.saveVerdictFeedback.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const submission = parseApiRequest(routes.saveVerdictFeedback.request.body, body);
  const result = await saveVerdictFeedback(caller.userId, slug, submission);
  if (!result.found) throw new ApiError(404, "not_found", "Restaurant not found");
  if (!result.feedback) throw new ApiError(409, "verdict_changed", "This Verdict changed. Reload the report and try again.");
  return apiJsonResponse(routes.saveVerdictFeedback.responses[200], 200, { feedback: result.feedback });
});
