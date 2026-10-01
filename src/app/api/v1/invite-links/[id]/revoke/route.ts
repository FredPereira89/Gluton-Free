import { apiJsonResponse, routes } from "@/lib/api-contract";
import { revokeInviteLink } from "@/lib/invite";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireOwnerApi(request);
  const { id } = parseApiRequest(routes.revokeInviteLink.request.params, await params);
  if (!(await revokeInviteLink(id))) throw new ApiError(404, "not_found", "Invite link not found");
  return apiJsonResponse(routes.revokeInviteLink.responses[200], 200, { revoked: true });
});
