import { routes } from "@/lib/api-contract";
import { dismissFormatQuestion } from "@/lib/owner-question";
import { parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireOwnerApi(request);
  const { id } = parseApiRequest(routes.dismissFormatQuestion.request.params, await params);
  return dismissFormatQuestion(id);
});
