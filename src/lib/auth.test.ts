import * as jose from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { AuthError, requireOwner } from "./auth";

const SUPABASE_URL = "https://owner-check-test.supabase.co";
const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const KID = "test-key-1";

const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: KID, alg: "ES256", use: "sig" };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.OWNER_USER_ID = OWNER_ID;
});

async function signToken(sub: string): Promise<string> {
  return new jose.SignJWT({ sub, aud: "authenticated", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

function jwksFetch(extra?: (url: string, init?: RequestInit) => Response | null): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (extra) {
      const handled = extra(url, init);
      if (handled) return handled;
    }
    if (url.endsWith("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** Signs in for real through @supabase/ssr's own storage encoder, so the resulting
 *  cookie header is byte-for-byte what the production sign-in route would produce. */
async function cookiesForOwnerSession(sub: string): Promise<string> {
  const accessToken = await signToken(sub);
  const captured: { name: string; value: string; options: CookieOptions }[] = [];
  const fetchImpl = jwksFetch((url) => {
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: sub, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return null;
  });
  const client = createServerClient(SUPABASE_URL, "test-anon-key", {
    global: { fetch: fetchImpl },
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        captured.push(...cookies);
      },
    },
  });
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: "test-refresh-token" });
  if (error) throw error;
  return captured.map(({ name, value }) => `${name}=${value}`).join("; ");
}

function request(init: RequestInit & { pathname?: string } = {}): Request {
  return new Request(`https://app.example${init.pathname ?? "/api/v1/restaurants/x"}`, init);
}

describe("requireOwner: bearer tokens", () => {
  it("rejects a request with no credentials", async () => {
    await expect(requireOwner(request(), { fetch: jwksFetch() })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a malformed bearer token", async () => {
    const req = request({ headers: { authorization: "Bearer not-a-jwt" } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).rejects.toMatchObject({ status: 401 });
  });

  it("accepts a bearer JWT for the owner", async () => {
    const token = await signToken(OWNER_ID);
    const req = request({ headers: { authorization: `Bearer ${token}` } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).resolves.toBe(OWNER_ID);
  });

  it("rejects a bearer JWT for another user", async () => {
    const token = await signToken(OTHER_ID);
    const req = request({ headers: { authorization: `Bearer ${token}` } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).rejects.toMatchObject({ status: 403 });
  });

  it("exempts bearer-authenticated mutations from the Origin/CSRF check", async () => {
    const token = await signToken(OWNER_ID);
    const req = request({ method: "POST", headers: { authorization: `Bearer ${token}` } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).resolves.toBe(OWNER_ID);
  });
});

describe("requireOwner: cookie sessions", () => {
  it("accepts a cookie session for the owner", async () => {
    const cookie = await cookiesForOwnerSession(OWNER_ID);
    const req = request({ headers: { cookie } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).resolves.toBe(OWNER_ID);
  });

  it("rejects a cookie session for another user", async () => {
    const cookie = await cookiesForOwnerSession(OTHER_ID);
    const req = request({ headers: { cookie } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a mutating cookie-authenticated request with a missing Origin", async () => {
    const cookie = await cookiesForOwnerSession(OWNER_ID);
    const req = request({ method: "POST", headers: { cookie } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).rejects.toMatchObject({ status: 403, code: "csrf" });
  });

  it("rejects a mutating cookie-authenticated request with a mismatched Origin", async () => {
    const cookie = await cookiesForOwnerSession(OWNER_ID);
    const req = request({ method: "POST", headers: { cookie, origin: "https://evil.example" } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).rejects.toMatchObject({ status: 403, code: "csrf" });
  });

  it("accepts a mutating cookie-authenticated request with a matching Origin", async () => {
    const cookie = await cookiesForOwnerSession(OWNER_ID);
    const req = request({ method: "POST", headers: { cookie, origin: "https://app.example" } });
    await expect(requireOwner(req, { fetch: jwksFetch() })).resolves.toBe(OWNER_ID);
  });
});

describe("requireOwner: configuration", () => {
  it("fails closed when OWNER_USER_ID is not set", async () => {
    delete process.env.OWNER_USER_ID;
    const token = await signToken(OWNER_ID);
    const req = request({ headers: { authorization: `Bearer ${token}` } });
    const err = await requireOwner(req, { fetch: jwksFetch() }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).status).toBe(503);
  });
});
