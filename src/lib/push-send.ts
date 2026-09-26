import webpush from "web-push";
import { db } from "./db";
import { configuredVapidPublicKey } from "./push-config";

export type PushKind = "verdict_ready" | "lookup_failed" | "owner_question";

/** Sends the minimal `{kind, restaurantSlug, questionId?}` payload to every stored subscription; a 404/410 deletes it. */
export async function sendPush(kind: PushKind, restaurantId: number, questionId?: number): Promise<void> {
  const publicKey = configuredVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return;

  // Push is a best-effort side effect (mirrors ADR-0005's fire-and-forget Owner questions):
  // a DB blip here must never flip the caller's job/request outcome.
  const sql = db();
  let restaurant, subscriptions;
  try {
    [restaurant] = await sql`select slug from restaurant where id = ${restaurantId}`;
    if (!restaurant) return;
    subscriptions = await sql`select id, endpoint, p256dh_key, auth_key from push_subscription`;
  } catch (error) {
    console.error("Push send failed", error);
    return;
  }
  const payload = JSON.stringify({ kind, restaurantSlug: restaurant.slug as string, ...(questionId ? { questionId } : {}) });

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint as string,
          keys: { p256dh: subscription.p256dh_key as string, auth: subscription.auth_key as string },
        },
        payload,
        { vapidDetails: { subject, publicKey, privateKey } },
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sql`delete from push_subscription where id = ${subscription.id}`;
      } else {
        console.error("Push send failed", error);
      }
    }
  }));
}
