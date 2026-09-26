import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { sendPush } from "@/lib/push-send";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));
const webpushSendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification: webpushSendNotification } }));

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = pair.publicKey.export({ format: "jwk" });
const privateJwk = pair.privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x!, "base64url"), Buffer.from(publicJwk.y!, "base64url")]).toString("base64url");
const privateKey = privateJwk.d!;

const query = vi.fn();

function sqlText(strings: TemplateStringsArray): string {
  return strings.join("?");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_SUBJECT = "mailto:owner@example.test";
});

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

describe("sendPush", () => {
  it("sends the minimal {kind, restaurantSlug} payload to every stored subscription", async () => {
    query.mockImplementation((strings: TemplateStringsArray) => {
      const text = sqlText(strings);
      if (text.includes("from restaurant")) return Promise.resolve([{ slug: "fictional-bistro" }]);
      if (text.includes("from push_subscription")) return Promise.resolve([
        { id: 1, endpoint: "https://push.example.test/a", p256dh_key: "p256dh-a", auth_key: "auth-a" },
        { id: 2, endpoint: "https://push.example.test/b", p256dh_key: "p256dh-b", auth_key: "auth-b" },
      ]);
      throw new Error(`Unexpected query: ${text}`);
    });
    webpushSendNotification.mockResolvedValue(undefined);

    await sendPush("verdict_ready", 7);

    expect(webpushSendNotification).toHaveBeenCalledTimes(2);
    const [subscription, payload, options] = webpushSendNotification.mock.calls[0]!;
    expect(subscription).toEqual({ endpoint: "https://push.example.test/a", keys: { p256dh: "p256dh-a", auth: "auth-a" } });
    expect(JSON.parse(payload as string)).toEqual({ kind: "verdict_ready", restaurantSlug: "fictional-bistro" });
    expect((options as { vapidDetails: unknown }).vapidDetails).toMatchObject({ subject: "mailto:owner@example.test", publicKey, privateKey });
  });

  it("includes questionId only when given", async () => {
    query.mockImplementation((strings: TemplateStringsArray) => {
      const text = sqlText(strings);
      if (text.includes("from restaurant")) return Promise.resolve([{ slug: "fictional-bistro" }]);
      if (text.includes("from push_subscription")) return Promise.resolve([
        { id: 1, endpoint: "https://push.example.test/a", p256dh_key: "p256dh-a", auth_key: "auth-a" },
      ]);
      throw new Error(`Unexpected query: ${text}`);
    });
    webpushSendNotification.mockResolvedValue(undefined);

    await sendPush("owner_question", 7, 99);

    const [, payload] = webpushSendNotification.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({ kind: "owner_question", restaurantSlug: "fictional-bistro", questionId: 99 });
  });

  it("deletes a subscription on 404/410 without throwing, and leaves other subscriptions untouched", async () => {
    const deletedIds: unknown[] = [];
    query.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = sqlText(strings);
      if (text.includes("delete from push_subscription")) {
        deletedIds.push(values[0]);
        return Promise.resolve([]);
      }
      if (text.includes("from restaurant")) return Promise.resolve([{ slug: "fictional-bistro" }]);
      if (text.includes("from push_subscription")) return Promise.resolve([
        { id: 1, endpoint: "https://push.example.test/gone", p256dh_key: "p256dh-a", auth_key: "auth-a" },
        { id: 2, endpoint: "https://push.example.test/stale", p256dh_key: "p256dh-b", auth_key: "auth-b" },
        { id: 3, endpoint: "https://push.example.test/ok", p256dh_key: "p256dh-c", auth_key: "auth-c" },
      ]);
      throw new Error(`Unexpected query: ${text}`);
    });
    webpushSendNotification.mockImplementation((subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("/gone")) return Promise.reject(Object.assign(new Error("Gone"), { statusCode: 410 }));
      if (subscription.endpoint.endsWith("/stale")) return Promise.reject(Object.assign(new Error("Not Found"), { statusCode: 404 }));
      return Promise.resolve(undefined);
    });

    await expect(sendPush("lookup_failed", 7)).resolves.toBeUndefined();

    expect(deletedIds.sort()).toEqual([1, 2]);
  });

  it("does nothing when VAPID is not fully configured", async () => {
    delete process.env.VAPID_SUBJECT;
    await sendPush("verdict_ready", 7);
    expect(db).not.toHaveBeenCalled();
    expect(webpushSendNotification).not.toHaveBeenCalled();
  });
});
