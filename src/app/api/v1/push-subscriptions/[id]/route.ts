import { apiJsonResponse, routes } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const DELETE = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ownerId = await requireOwnerApi(request);
  const { id } = parseApiRequest(routes.deletePushSubscription.request.params, await params);
  const [subscription] = await db()`
    delete from push_subscription
    where id = ${id} and owner_user_id = ${ownerId}
    returning id`;
  if (!subscription) throw new ApiError(404, "not_found", "Push subscription not found");
  return apiJsonResponse(routes.deletePushSubscription.responses[200], 200, { deleted: true });
});
