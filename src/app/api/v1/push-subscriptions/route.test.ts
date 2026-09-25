import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { routes } from "@/lib/api-contract";
import { AuthError, requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireOwner: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: vi.fn() }));

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = pair.publicKey.export({ format: "jwk" });
const privateJwk = pair.privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x!, "base64url"), Buffer.from(publicJwk.y!, "base64url")]).toString("base64url");
const privateKey = privateJwk.d!;
const validSubscription = {
  type: "web",
  endpoint: "https://push.example.test/subscription/abc",
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
};
const query = Object.assign(vi.fn(), { json: vi.fn((value: unknown) => JSON.stringify(value)) });

function post(body: unknown) {
  return new Request("http://localhost/api/v1/push-subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue("11111111-1111-4111-8111-111111111111");
  vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
  query.mockResolvedValue([{ id: "42" }]);
  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
});

describe("POST /api/v1/push-subscriptions", () => {
  it("stores a valid web subscription for the authenticated owner", async () => {
    const response = await POST(post(validSubscription));
    expect(response.status).toBe(201);
    expect(routes.createPushSubscription.responses[201].parse(await response.json())).toEqual({ id: 42 });
    const [template, ...values] = query.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(template.join("?")).toContain("on conflict (owner_user_id, endpoint) do update");
    expect(values).toEqual(["11111111-1111-4111-8111-111111111111", "web", validSubscription.endpoint, validSubscription.keys.p256dh, validSubscription.keys.auth]);
  });

  it("rejects malformed and non-HTTPS subscriptions before touching the database", async () => {
    const malformed = await POST(post("{"));
    expect(malformed.status).toBe(400);
    expect(routes.createPushSubscription.responses[400].parse(await malformed.json()).code).toBe("invalid_request");

    const invalidType = await POST(post({ ...validSubscription, type: "apns" }));
    expect(invalidType.status).toBe(400);
    const invalidEndpoint = await POST(post({ ...validSubscription, endpoint: "http://push.example.test/subscription" }));
    expect(invalidEndpoint.status).toBe(400);
    const invalidKeys = await POST(post({ ...validSubscription, keys: { p256dh: "bad", auth: "bad" } }));
    expect(invalidKeys.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a body with undeclared fields", async () => {
    const response = await POST(post({ ...validSubscription, extra: "not allowed" }));
    expect(response.status).toBe(400);
    expect(routes.createPushSubscription.responses[400].parse(await response.json()).code).toBe("invalid_request");
    expect(query).not.toHaveBeenCalled();
  });

  it("requires owner authorization and a matching configured VAPID pair", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new AuthError(401, "unauthenticated", "No session"));
    const unauthorized = await POST(post(validSubscription));
    expect(unauthorized.status).toBe(401);

    delete process.env.VAPID_PRIVATE_KEY;
    const unavailable = await POST(post(validSubscription));
    expect(unavailable.status).toBe(503);
    expect(routes.createPushSubscription.responses[503].parse(await unavailable.json()).code).toBe("push_not_configured");

    process.env.VAPID_PRIVATE_KEY = Buffer.alloc(32, 9).toString("base64url");
    const mismatched = await POST(post(validSubscription));
    expect(mismatched.status).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });
});
