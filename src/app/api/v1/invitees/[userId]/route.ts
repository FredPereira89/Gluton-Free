import { apiJsonResponse, routes } from "@/lib/api-contract";
import { setInviteeLockedOut } from "@/lib/invite";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

// Locking out takes effect on the Invitee's next request: the auth check reads this flag every time.
export const PATCH = withApiErrors(async (request: Request, { params }: { params: Promise<{ userId: string }> }) => {
  await requireOwnerApi(request);
  const { userId } = parseApiRequest(routes.setInviteeLockOut.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { lockedOut } = parseApiRequest(routes.setInviteeLockOut.request.body, body);
  const invitee = await setInviteeLockedOut(userId, lockedOut);
  if (!invitee) throw new ApiError(404, "not_found", "Invitee not found");
  return apiJsonResponse(routes.setInviteeLockOut.responses[200], 200, invitee);
});
