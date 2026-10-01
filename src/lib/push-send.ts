import webpush from "web-push";
import { db } from "./db";
import { configuredVapidPublicKey } from "./push-config";

export type PushKind = "verdict_ready" | "lookup_failed" | "owner_question" | "database_size_warning";

type PushSubscriptionRow = { id: number; endpoint: string; p256dh_key: string; auth_key: string };
type VapidDetails = { subject: string; publicKey: string; privateKey: string };

function configuredVapidDetails(): VapidDetails | null {
  const publicKey = configuredVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { subject, publicKey, privateKey } : null;
}

async function deliver(
  sql: ReturnType<typeof db>, subscriptions: PushSubscriptionRow[], payload: string, vapidDetails: VapidDetails,
): Promise<void> {
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key },
        },
        payload,
        { vapidDetails },
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

/** Sends the minimal `{kind, restaurantSlug, questionId?}` payload to every stored subscription; a 404/410 deletes it. */
export async function sendPush(kind: Exclude<PushKind, "database_size_warning">, restaurantId: number, questionId?: number): Promise<void> {
  const vapidDetails = configuredVapidDetails();
  if (!vapidDetails) return;

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
  await deliver(sql, subscriptions as unknown as PushSubscriptionRow[], payload, vapidDetails);
}

/** Sends one infrastructure warning to every subscribed device without coupling it to a Restaurant. */
export async function sendDatabaseSizeWarning(sizeBytes: number): Promise<void> {
  const vapidDetails = configuredVapidDetails();
  if (!vapidDetails) return;
  const sql = db();
  let subscriptions;
  try {
    subscriptions = await sql`select id, endpoint, p256dh_key, auth_key from push_subscription`;
  } catch (error) {
    console.error("Push send failed", error);
    return;
  }
  const sizeMb = Number((sizeBytes / 1_000_000).toFixed(1));
  await deliver(sql, subscriptions as unknown as PushSubscriptionRow[], JSON.stringify({ kind: "database_size_warning", sizeMb }), vapidDetails);
}
