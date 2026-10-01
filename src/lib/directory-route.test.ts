import * as jose from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/directory/route";
import { proxy } from "@/proxy";
import { routes } from "./api-contract";
import { db } from "./db";

vi.mock("./db", () => ({ db: vi.fn() }));

const ownerId = "11111111-1111-1111-1111-111111111111";
const inviteeId = "33333333-3333-3333-3333-333333333333";
const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: "directory-test", alg: "ES256", use: "sig" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://directory-test.supabase.co";
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
    .setProtectedHeader({ alg: "ES256", kid: "directory-test" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function dispatch(search = "", init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  const request = new NextRequest(`https://app.example/api/v1/directory${search}`, init);
  const gate = await proxy(request);
  return gate.headers.get("x-middleware-next") === "1" ? GET(request) : gate;
}

const dbRow = (overrides: Record<string, unknown>) => ({
  id: 1, created_at: new Date(),
  slug: "x", name: "X", address: null, area: "Alfama", lat: null, lng: null, format: "tasca", price_tier: "€€",
  state: "verdict", tier: "good", confidence: "medium", provisional: false,
  food_percentile: 50, value_percentile: 50, google_place_id: "ChIJabcde", thefork_url: null,
  ...overrides,
});

function directoryDb(rows: Record<string, unknown>[], facts: Record<string, unknown>[] = [], categories: Record<string, unknown>[] = []) {
  const sql = Object.assign(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    return query.includes("with windowed") ? facts : query.includes("select restaurant_id, categories") ? categories : rows;
  }, { json: (value: unknown) => JSON.stringify(value) });
  return sql as unknown as ReturnType<typeof db>;
}
describe("GET /api/v1/directory", () => {
  it("filters Dietary fit server-side using category proof and Review praise, with URL filters", async () => {
    vi.mocked(db).mockReturnValue(directoryDb(
      [dbRow({ id: 1, slug: "a", name: "Tasca A" }), dbRow({ id: 2, slug: "b", name: "Tasca B" })],
      [1, 2, 3].map((id) => ({ id, restaurant_id: 1, dietary_praise: ["vegan"], dietary_complaints: [] })),
      [{ restaurant_id: 2, categories: ["Gluten-free restaurant"] }],
    ));
    const response = await GET(new Request("https://app.example/api/v1/directory?diet=vegan&q=tasca&area=Alfama"));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toMatchObject([{ slug: "a", dietaryFits: ["vegan"] }]);
  });

  it("is open to the Owner and an Invitee, closed to everyone else", async () => {
    vi.mocked(db).mockReturnValue((async (strings: TemplateStringsArray, userId: string) =>
      strings.join(" ").includes("from invitee") ? (userId === inviteeId ? [{ ok: 1 }] : []) : []) as unknown as ReturnType<typeof db>);

    const missing = await dispatch();
    expect(missing.status).toBe(401);
    const foreign = await dispatch("", { headers: { authorization: `Bearer ${await token("22222222-2222-2222-2222-222222222222")}` } });
    expect(foreign.status).toBe(403);
    for (const sub of [ownerId, inviteeId]) {
      const response = await dispatch("", { headers: { authorization: `Bearer ${await token(sub)}` } });
      expect(response.status).toBe(200);
      expect(routes.directory.responses[200].parse(await response.json())).toMatchObject({ items: [], total: 0, page: 1 });
    }
  });

  it("answers search, sort, filters and paging from the URL, with human labels and a booking link", async () => {
    vi.mocked(db).mockReturnValue(directoryDb([
      dbRow({ slug: "a", name: "Alfa Tasca", tier: "good", food_percentile: 30 }),
      dbRow({ slug: "b", name: "Beta Tasca", tier: "must_go", food_percentile: 90, thefork_url: "https://www.thefork.pt/restaurante/beta-r1?utm=x" }),
      dbRow({ slug: "c", name: "Gama Marisco", format: "marisqueira_cervejaria", area: "Chiado" }),
    ]));

    const response = await GET(new Request("https://app.example/api/v1/directory?q=tasca&sort=food&area=Alfama&pageSize=1&page=2"));
    expect(response.status).toBe(200);
    const body = routes.directory.responses[200].parse(await response.json());
    expect(body).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(body.items.map((item) => item.slug)).toEqual(["a"]);
    expect(body.items[0]).toMatchObject({ format: "Tasca", neighbourhood: "Alfama", booking: { kind: "google_maps", label: "Open in Google Maps" } });

    const first = routes.directory.responses[200].parse(await (await GET(new Request("https://app.example/api/v1/directory?q=tasca&sort=food&area=Alfama&pageSize=1"))).json());
    expect(first.items[0]).toMatchObject({ slug: "b", booking: { kind: "thefork", url: "https://www.thefork.pt/restaurante/beta-r1" } });
  });

  it("includes Not enough evidence Restaurants only on request", async () => {
    vi.mocked(db).mockReturnValue(directoryDb([dbRow({ slug: "t", state: "not_enough_evidence", tier: null, confidence: null })]));
    const hidden = routes.directory.responses[200].parse(await (await GET(new Request("https://app.example/api/v1/directory"))).json());
    expect(hidden).toMatchObject({ total: 0, hiddenNotEnoughEvidence: 1 });
    const shown = routes.directory.responses[200].parse(await (await GET(new Request("https://app.example/api/v1/directory?nee=1"))).json());
    expect(shown.items.map((item) => item.state)).toEqual(["not_enough_evidence"]);
  });

  it.each(["sort=vibes", "tier=gold", "family=bistro", "page=0", "pageSize=101", "nee=maybe"])("returns a declared problem for %s", async (query) => {
    const response = await GET(new Request(`https://app.example/api/v1/directory?${query}`));
    expect(response.status).toBe(400);
    expect(routes.directory.responses[400].parse(await response.json()).code).toBe("invalid_request");
  });
});
