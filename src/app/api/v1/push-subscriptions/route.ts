import { apiJsonResponse, routes } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { configuredVapidPublicKey } from "@/lib/push-config";

export const POST = withApiErrors(async (request: Request) => {
  const ownerId = await requireOwnerApi(request);
  if (!configuredVapidPublicKey()) throw new ApiError(503, "push_not_configured", "Web push is not configured");
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { type, endpoint, keys } = parseApiRequest(routes.createPushSubscription.request.body, body);
  const sql = db();
  const [subscription] = await sql`
    insert into push_subscription (owner_user_id, type, endpoint, p256dh_key, auth_key)
    values (${ownerId}, ${type}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
    on conflict (owner_user_id, endpoint) do update
      set type = excluded.type,
          p256dh_key = excluded.p256dh_key,
          auth_key = excluded.auth_key,
          updated_at = now()
    returning id`;
  const id = Number(subscription?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Push subscription insert returned an invalid id");
  return apiJsonResponse(routes.createPushSubscription.responses[201], 201, { id });
});
