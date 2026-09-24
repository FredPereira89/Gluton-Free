import * as jose from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/restaurants/[slug]/verdicts/route";
import { proxy } from "@/proxy";
import { routes } from "./api-contract";
import { db } from "./db";

vi.mock("./db", () => ({ db: vi.fn() }));

const verdicts = [
  { id: "4", created_at: new Date("2026-09-24T12:00:00.000Z"), state: "not_enough_evidence", tier: null, confidence: "low", provisional: true, peer_snapshot_id: null },
  { id: "7", created_at: new Date("2026-10-01T09:00:00.000Z"), state: "verdict", tier: "ok", confidence: "low", provisional: true, peer_snapshot_id: null },
  { id: "9", created_at: new Date("2026-11-01T09:00:00.000Z"), state: "verdict", tier: "good", confidence: "medium", provisional: false, peer_snapshot_id: "3" },
];
const restaurants: Record<string, { name: string; verdicts: typeof verdicts }> = {
  "o-velho-eurico": { name: "O Velho Eurico", verdicts },
  "no-verdicts-yet": { name: "Nothing Yet", verdicts: [] },
};

// Mirrors the loader's query: the Restaurant left-joined to its Verdicts older than the cursor, newest first.
function fakeDb() {
  vi.mocked(db).mockReturnValue((async (_strings: TemplateStringsArray, before: string, slug: string, take: number) => {
    const restaurant = restaurants[slug];
    if (!restaurant) return [];
    const older = restaurant.verdicts.filter((v) => BigInt(v.id) < BigInt(before)).sort((a, b) => Number(b.id) - Number(a.id));
    const rows = older.map((v) => ({ name: restaurant.name, ...v }));
    return (rows.length ? rows : [{ name: restaurant.name, id: null }]).slice(0, take);
  }) as unknown as ReturnType<typeof db>);
}

function get(slug: string, query = "") {
  return GET(new Request(`https://app.example/api/v1/restaurants/${slug}/verdicts${query}`), { params: Promise.resolve({ slug }) });
}

const ownerId = "11111111-1111-1111-1111-111111111111";
const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: "history-test", alg: "ES256", use: "sig" };

async function token(sub: string) {
  return new jose.SignJWT({ sub, aud: "authenticated", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "history-test" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function dispatch(slug: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  const request = new NextRequest(`https://app.example/api/v1/restaurants/${slug}/verdicts`, init);
  const gate = await proxy(request);
  return gate.headers.get("x-middleware-next") === "1" ? GET(request, { params: Promise.resolve({ slug }) }) : gate;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://history-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.OWNER_USER_ID = ownerId;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: String(input).endsWith("/.well-known/jwks.json") ? 200 : 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch);
});

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/v1/restaurants/:slug/verdicts", () => {
  it("returns every Verdict newest first across cursor pages", async () => {
    const pages = [];
    let cursor: string | null = null;
    do {
      const response = await get("o-velho-eurico", `?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const page = routes.verdictHistory.responses[200].parse(await response.json());
      pages.push(page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(pages).toEqual([[9, 7], [4]]);
  });

  it("describes each Verdict with its date, Tier, Confidence, provisional flag and Peer snapshot", async () => {
    const page = routes.verdictHistory.responses[200].parse(await (await get("o-velho-eurico")).json());
    expect(page).toEqual({
      items: [
        { id: 9, issuedAt: "2026-11-01T09:00:00.000Z", state: "verdict", tier: "good", confidence: "medium", provisional: false, peerSnapshotId: 3 },
        { id: 7, issuedAt: "2026-10-01T09:00:00.000Z", state: "verdict", tier: "ok", confidence: "low", provisional: true, peerSnapshotId: null },
        { id: 4, issuedAt: "2026-09-24T12:00:00.000Z", state: "not_enough_evidence", tier: null, confidence: "low", provisional: true, peerSnapshotId: null },
      ],
      nextCursor: null,
    });
  });

  it("returns an empty history for a Restaurant with no Verdict yet", async () => {
    const response = await get("no-verdicts-yet");
    expect(response.status).toBe(200);
    expect(routes.verdictHistory.responses[200].parse(await response.json())).toEqual({ items: [], nextCursor: null });
  });

  it("returns a not_found problem for an unknown Restaurant", async () => {
    const response = await get("missing");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(routes.verdictHistory.responses[404].parse(await response.json()).code).toBe("not_found");
  });

  it.each(["limit=0", "limit=101", "limit=abc", "cursor=bad", "cursor=0", "cursor=9223372036854775808"])(
    "returns a declared problem for %s",
    async (query) => {
      const response = await get("o-velho-eurico", `?${query}`);
      expect(response.status).toBe(400);
      expect(routes.verdictHistory.responses[400].parse(await response.json()).code).toBe("invalid_request");
      expect(db).not.toHaveBeenCalled();
    },
  );

  it("requires the owner before reading the history", async () => {
    const missing = await dispatch("o-velho-eurico");
    expect(missing.status).toBe(401);
    expect(routes.verdictHistory.responses[401].parse(await missing.json()).code).toBe("unauthenticated");

    const foreign = await dispatch("o-velho-eurico", { headers: { authorization: `Bearer ${await token("22222222-2222-2222-2222-222222222222")}` } });
    expect(foreign.status).toBe(403);
    expect(routes.verdictHistory.responses[403].parse(await foreign.json()).code).toBe("forbidden");
    expect(db).not.toHaveBeenCalled();

    const owner = await dispatch("o-velho-eurico", { headers: { authorization: `Bearer ${await token(ownerId)}` } });
    expect(owner.status).toBe(200);
    expect(routes.verdictHistory.responses[200].parse(await owner.json()).items).toHaveLength(3);
  });
});
