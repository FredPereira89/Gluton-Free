import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as jose from "jose";
import postgres from "postgres";
import { routes } from "@/lib/api-contract";
import { closeDb } from "@/lib/db";
import { GET as getRestaurant } from "@/app/api/v1/restaurants/[slug]/route";
import { DELETE, POST } from "./route";

let containerId: string | undefined;
let sql: postgres.Sql;
let ownerToken: string;
let otherToken: string;
const oldUrl = process.env.SUPABASE_DB_URL;
const oldSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const oldPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const oldOwnerId = process.env.OWNER_USER_ID;
const ownerId = "11111111-1111-1111-1111-111111111111";
const otherId = "22222222-2222-2222-2222-222222222222";

function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: "critic-test-key", alg: "ES256", use: "sig" };
  const signToken = (sub: string) => new jose.SignJWT({ sub, aud: "authenticated", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "critic-test-key" }).setIssuedAt().setExpirationTime("1h").sign(privateKey);
  [ownerToken, otherToken] = await Promise.all([signToken(ownerId), signToken(otherId)]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://critic-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.OWNER_USER_ID = ownerId;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/.well-known/jwks.json")) {
      return Response.json({ keys: [publicJwk] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch);
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=critic-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  process.env.SUPABASE_DB_URL = `postgres://postgres:critic-test-only@127.0.0.1:${port}/postgres`;
  sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, connect_timeout: 1 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await sql`select 1`; break; }
    catch {
      if (attempt === 99) throw new Error("Disposable Postgres did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { cwd: process.cwd(), env: process.env });
  await sql`insert into restaurant (slug, name, city, format, format_provenance) values ('sample', 'Sample', 'Lisbon', 'tasca', 'owner')`;
  await sql`insert into restaurant (slug, name, city, format, format_provenance) values ('no-verdict', 'No Verdict', 'Lisbon', 'tasca', 'owner')`;
  await sql`
    insert into verdict (restaurant_id, state, tier, confidence, provisional, blocks, explanation, inputs_hash)
    select id, 'verdict', 'good', 'high', false, '{}'::jsonb, 'Based on Reviews', 'fixed-inputs-hash'
    from restaurant where slug = 'sample'`;
}, 60_000);

afterAll(async () => {
  await closeDb();
  await sql?.end();
  if (containerId) docker("rm", "-f", containerId);
  if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL;
  else process.env.SUPABASE_DB_URL = oldUrl;
  if (oldSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = oldSupabaseUrl;
  if (oldPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldPublishableKey;
  if (oldOwnerId === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = oldOwnerId;
  vi.unstubAllGlobals();
});

const context = (slug = "sample") => ({ params: Promise.resolve({ slug }) });
const request = (method: "POST" | "DELETE", body: unknown) => new Request("http://localhost/api/v1/restaurants/sample/critic-pieces", {
  method, headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` }, body: JSON.stringify(body),
});
const valid = {
  publication: "Time Out Lisboa", title: "A new look at Sample", url: "https://example.com/critics/sample",
  publishedOn: "2026-09-15", language: "pt", printedRating: "4/5",
};

describe("Critic piece handlers (issue #62)", () => {
  it("creates and deletes a piece while preserving the Tier and inputs hash", async () => {
    const before = await sql`select id, tier, inputs_hash, explanation from verdict`;
    const created = await POST(request("POST", valid), context());
    expect(created.status).toBe(201);
    const { id } = routes.createCriticPiece.responses[201].parse(await created.json());
    expect(await sql`select publication, title, url, published_on::text, language, printed_rating from critic_piece where id = ${id}`).toMatchObject([{
      publication: valid.publication, title: valid.title, url: valid.url,
      published_on: valid.publishedOn, language: valid.language, printed_rating: valid.printedRating,
    }]);
    expect(await sql`select id, tier, inputs_hash, explanation from verdict`).toEqual(before);

    const deleted = await DELETE(request("DELETE", { id }), context());
    expect(deleted.status).toBe(200);
    expect(routes.deleteCriticPiece.responses[200].parse(await deleted.json())).toEqual({ deleted: true });
    expect(await sql`select id from critic_piece where id = ${id}`).toEqual([]);
    expect(await sql`select id, tier, inputs_hash, explanation from verdict`).toEqual(before);
  });

  it("rejects invalid fields and extra data", async () => {
    for (const body of [
      { ...valid, publication: " " }, { ...valid, title: " " },
      { ...valid, url: "javascript:alert(1)" }, { ...valid, publishedOn: "2026-02-30" },
      { ...valid, language: "not a language!" }, { ...valid, printedRating: " " },
      { ...valid, reviewerName: "private" },
    ]) {
      const response = await POST(request("POST", body), context());
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_request");
    }
    expect(await sql`select id from critic_piece`).toEqual([]);
  });

  it("accepts absent optional display metadata", async () => {
    const created = await POST(request("POST", { ...valid, publishedOn: null, language: null, printedRating: null }), context());
    expect(created.status).toBe(201);
    const { id } = routes.createCriticPiece.responses[201].parse(await created.json());
    expect(await sql`select published_on, language, printed_rating from critic_piece where id = ${id}`).toMatchObject([
      { published_on: null, language: null, printed_rating: null },
    ]);
    await DELETE(request("DELETE", { id }), context());
  });

  it("exposes the attached piece in the strict Restaurant bundle", async () => {
    const created = await POST(request("POST", valid), context("no-verdict"));
    const { id } = routes.createCriticPiece.responses[201].parse(await created.json());
    const response = await getRestaurant(new Request("http://localhost/api/v1/restaurants/no-verdict"), context("no-verdict"));
    expect(response.status).toBe(200);
    const bundle = routes.restaurantBundle.responses[200].parse(await response.json());
    expect(bundle.critics).toEqual([{ id, ...valid }]);
    await DELETE(request("DELETE", { id }), context("no-verdict"));
  });

  it("scopes create and delete to the Restaurant", async () => {
    expect((await POST(request("POST", valid), context("missing"))).status).toBe(404);
    const created = await POST(request("POST", valid), context());
    const { id } = routes.createCriticPiece.responses[201].parse(await created.json());
    expect((await DELETE(request("DELETE", { id }), context("missing"))).status).toBe(404);
    expect((await sql`select id from critic_piece where id = ${id}`).length).toBe(1);
    await DELETE(request("DELETE", { id }), context());
  });

  it("rejects invalid delete input and malformed JSON", async () => {
    expect((await DELETE(request("DELETE", { id: -1 }), context())).status).toBe(400);
    const response = await POST(new Request("http://localhost/api/v1/restaurants/sample/critic-pieces", {
      method: "POST", headers: { authorization: `Bearer ${ownerToken}` }, body: "{",
    }), context());
    expect(response.status).toBe(400);
  });

  it("requires the real owner credential and a matching Origin for cookie writes", async () => {
    const url = "http://localhost/api/v1/restaurants/sample/critic-pieces";
    const invalid = await POST(new Request(url, {
      method: "POST", headers: { authorization: "Bearer not-a-jwt" }, body: JSON.stringify(valid),
    }), context());
    expect(invalid.status).toBe(401);
    expect(routes.createCriticPiece.responses[401].parse(await invalid.json()).code).toBe("unauthenticated");
    const wrongOwner = await POST(new Request(url, {
      method: "POST", headers: { authorization: `Bearer ${otherToken}` }, body: JSON.stringify(valid),
    }), context());
    expect(wrongOwner.status).toBe(403);
    expect(routes.createCriticPiece.responses[403].parse(await wrongOwner.json()).code).toBe("forbidden");
    const missingOrigin = await POST(new Request(url, {
      method: "POST", headers: { cookie: "session=fake" }, body: JSON.stringify(valid),
    }), context());
    expect(missingOrigin.status).toBe(403);
    expect(routes.createCriticPiece.responses[403].parse(await missingOrigin.json()).code).toBe("csrf");
    const invalidDelete = await DELETE(new Request(url, {
      method: "DELETE", headers: { authorization: "Bearer not-a-jwt" }, body: JSON.stringify({ id: 1 }),
    }), context());
    expect(invalidDelete.status).toBe(401);
    expect(routes.deleteCriticPiece.responses[401].parse(await invalidDelete.json()).code).toBe("unauthenticated");
    expect(await sql`select id from critic_piece`).toEqual([]);
  });
});
