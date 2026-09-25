import { routes } from "@/lib/api-contract";
import { answerListingQuestion } from "@/lib/owner-question";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const PUT = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string; source: string }> }) => {
  await requireOwnerApi(request);
  const { slug, source } = parseApiRequest(routes.answerListing.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { answer } = parseApiRequest(routes.answerListing.request.body, body);
  return answerListingQuestion(slug, source, answer);
});
