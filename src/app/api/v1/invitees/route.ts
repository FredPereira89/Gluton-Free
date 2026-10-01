import { apiJsonResponse, routes } from "@/lib/api-contract";
import { listInvitees } from "@/lib/invite";
import { requireOwnerApi, withApiErrors } from "@/lib/problem";

export const GET = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  return apiJsonResponse(routes.listInvitees.responses[200], 200, { items: await listInvitees() });
});
