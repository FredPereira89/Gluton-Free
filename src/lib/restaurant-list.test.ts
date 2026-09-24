import * as jose from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/restaurants/route";
import { proxy } from "@/proxy";
import { routes } from "./api-contract";
import { db } from "./db";

vi.mock("./db", () => ({ db: vi.fn() }));

const ownerId = "11111111-1111-1111-1111-111111111111";
const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: "list-test", alg: "ES256", use: "sig" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://list-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.OWNER_USER_ID = ownerId;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: String(input).endsWith("/.well-known/jwks.json") ? 200 : 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch);
});

afterEach(() => vi.unstubAllGlobals());

async function token(sub: string) {
  return new jose.SignJWT({ sub, aud: "authenticated", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "list-test" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function dispatch(init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  const request = new NextRequest("https://app.example/api/v1/restaurants?limit=2", init);
  const gate = await proxy(request);
  return gate.headers.get("x-middleware-next") === "1" ? GET(request) : gate;
}

const restaurants = [
  { id: "1", slug: "first", name: "First", city: "Lisbon", area: "Alfama", state: "verdict", tier: "good", provisional: false, lookedUp: true },
  { id: "2", slug: "peer", name: "Peer", city: "Lisbon", area: "Alfama", state: "verdict", tier: "good", provisional: false, lookedUp: false },
  { id: "3", slug: "second", name: "Second", city: "Lisbon", area: null, state: "not_enough_evidence", tier: null, provisional: true, lookedUp: true },
  { id: "4", slug: "third", name: "Third", city: "Lisbon", area: "Bairro Alto", state: null, tier: null, provisional: null, lookedUp: true },
];

describe("GET /api/v1/restaurants", () => {
  it("requires the owner before reading the list", async () => {
    vi.mocked(db).mockReturnValue((async () => []) as unknown as ReturnType<typeof db>);

    const missing = await dispatch();
    expect(missing.status).toBe(401);
    expect(routes.restaurantList.responses[401].parse(await missing.json()).code).toBe("unauthenticated");

    const foreign = await dispatch({ headers: { authorization: `Bearer ${await token("22222222-2222-2222-2222-222222222222")}` } });
    expect(foreign.status).toBe(403);
    expect(routes.restaurantList.responses[403].parse(await foreign.json()).code).toBe("forbidden");
    expect(db).not.toHaveBeenCalled();

    const owner = await dispatch({ headers: { authorization: `Bearer ${await token(ownerId)}` } });
    expect(owner.status).toBe(200);
    expect(routes.restaurantList.responses[200].parse(await owner.json())).toEqual({ items: [], nextCursor: null });
    expect(db).toHaveBeenCalledTimes(1);
  });

  it("reaches every Restaurant once across cursor pages", async () => {
    vi.mocked(db).mockReturnValue((async (strings: TemplateStringsArray, cursor: string, limit: number) => {
      expect(strings.join(" ")).toMatch(/exists\s*\(select 1 from job j where j\.restaurant_id = r\.id and j\.kind = 'lookup'\)/);
      return restaurants.filter((row) => row.lookedUp && BigInt(row.id) > BigInt(cursor)).slice(0, limit);
    }) as unknown as ReturnType<typeof db>);

    const items = [];
    let cursor: string | null = null;
    do {
      const url = new URL("https://app.example/api/v1/restaurants?limit=2");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await GET(new Request(url));
      expect(response.status).toBe(200);
      const page = routes.restaurantList.responses[200].parse(await response.json());
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    expect(items.map((item) => item.slug)).toEqual(["first", "second", "third"]);
    expect(items.map((item) => item.state)).toEqual(["verdict", "not_enough_evidence", "no_verdict"]);
    expect(items.map((item) => item.tier)).toEqual(["good", null, null]);
    expect(items.map((item) => item.provisional)).toEqual([false, true, null]);
  });

  it.each(["limit=0", "limit=101", "limit=abc", "cursor=bad", "cursor=0"]) (
    "returns a declared problem for %s",
    async (query) => {
      const response = await GET(new Request(`https://app.example/api/v1/restaurants?${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(routes.restaurantList.responses[400].parse(await response.json()).code).toBe("invalid_request");
    },
  );
});
