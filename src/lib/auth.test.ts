import * as jose from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { POST as signOut } from "@/app/api/auth/sign-out/route";
import { GET as getVerdict } from "@/app/api/v1/restaurants/[slug]/verdict/route";
import { routes } from "./api-contract";
import { loadVerdictPage } from "@/web/data";
import { AuthError, requireOwner } from "./auth";
import { problemSchema } from "./problem";
import { proxy } from "@/proxy";

vi.mock("@/web/data", () => ({ loadVerdictPage: vi.fn() }));

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

afterEach(() => vi.unstubAllGlobals());

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

describe("protected request handlers", () => {
  function apiRequest(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}): NextRequest {
    return new NextRequest(`https://app.example${path}`, init);
  }

  async function dispatch(request: NextRequest, handler?: (request: Request) => Promise<Response>): Promise<Response> {
    const gate = await proxy(request);
    if (gate.headers.get("x-middleware-next") !== "1") return gate;
    return handler ? handler(request) : gate;
  }

  it("lets an owner bearer token through without a cookie", async () => {
    vi.stubGlobal("fetch", jwksFetch());
    const token = await signToken(OWNER_ID);

    const response = await dispatch(apiRequest("/api/v1/restaurants/x/verdict", { headers: { authorization: `Bearer ${token}` } }));

    expect(response.status).toBe(200);
  });

  it("runs the protected Verdict handler only for the owner and parses its declared problems", async () => {
    vi.stubGlobal("fetch", jwksFetch());
    vi.mocked(loadVerdictPage).mockResolvedValue(null);
    const path = "/api/v1/restaurants/missing/verdict";
    const handler = (request: Request) => getVerdict(request, { params: Promise.resolve({ slug: "missing" }) });

    const unauthenticated = await dispatch(apiRequest(path), handler);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("content-type")).toBe("application/problem+json");
    expect(routes.verdict.responses[401].parse(await unauthenticated.json()).code).toBe("unauthenticated");

    const otherToken = await signToken(OTHER_ID);
    const forbidden = await dispatch(apiRequest(path, { headers: { authorization: `Bearer ${otherToken}` } }), handler);
    expect(forbidden.status).toBe(403);
    expect(routes.verdict.responses[403].parse(await forbidden.json()).code).toBe("forbidden");

    const ownerToken = await signToken(OWNER_ID);
    const missing = await dispatch(apiRequest(path, { headers: { authorization: `Bearer ${ownerToken}` } }), handler);
    expect(missing.status).toBe(404);
    expect(routes.verdict.responses[404].parse(await missing.json()).code).toBe("not_found");
    expect(loadVerdictPage).toHaveBeenCalledTimes(1);
  });

  it("uses the bearer token instead of an owner cookie", async () => {
    const cookie = await cookiesForOwnerSession(OWNER_ID);
    vi.stubGlobal("fetch", jwksFetch());
    const token = await signToken(OTHER_ID);

    const response = await dispatch(apiRequest("/api/v1/restaurants/x/verdict", { headers: { authorization: `Bearer ${token}`, cookie } }));

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(problemSchema.parse(await response.json()).code).toBe("forbidden");
  });

  it.each([
    ["missing", undefined],
    ["foreign", "https://evil.example"],
  ])("rejects a cookie-backed POST with a %s Origin", async (_label, origin) => {
    const cookie = await cookiesForOwnerSession(OWNER_ID);
    vi.stubGlobal("fetch", jwksFetch());
    const headers = new Headers({ cookie });
    if (origin) headers.set("origin", origin);

    const response = await dispatch(apiRequest("/api/auth/sign-out", { method: "POST", headers }), signOut);

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(problemSchema.parse(await response.json()).code).toBe("csrf");
  });

  it("lets a bearer-backed POST through without an Origin", async () => {
    vi.stubGlobal("fetch", jwksFetch());
    const token = await signToken(OWNER_ID);

    const response = await dispatch(apiRequest("/api/auth/sign-out", { method: "POST", headers: { authorization: `Bearer ${token}` } }), signOut);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/sign-in");
  });
});
