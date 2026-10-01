import { apiJsonResponse, routes } from "@/lib/api-contract";
import { createInviteLink, listInviteLinks } from "@/lib/invite";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const GET = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  return apiJsonResponse(routes.listInviteLinks.responses[200], 200, { items: await listInviteLinks() });
});

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { label, useCap } = parseApiRequest(routes.createInviteLink.request.body, body);
  return apiJsonResponse(routes.createInviteLink.responses[201], 201, await createInviteLink(label, useCap ?? null));
});
