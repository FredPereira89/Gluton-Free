import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { closeDb } from "@/lib/db";
import { DELETE, POST } from "./route";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), requireOwner: vi.fn().mockResolvedValue("owner"),
}));

let containerId: string | undefined;
let sql: postgres.Sql;
const oldUrl = process.env.SUPABASE_DB_URL;

function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=distinction-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  process.env.SUPABASE_DB_URL = `postgres://postgres:distinction-test-only@127.0.0.1:${port}/postgres`;
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
});

const context = (slug = "sample") => ({ params: Promise.resolve({ slug }) });
const request = (method: "POST" | "DELETE", body: unknown) => new Request("http://localhost/api/v1/restaurants/sample/distinctions", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const valid = { guide: "Michelin", level: "Bib Gourmand", editionYear: 2026, url: "https://guide.michelin.com/sample" };

describe("Distinction handlers (issue #61)", () => {
  it("creates and deletes a guide Distinction without changing the Tier, inputs hash or explanation", async () => {
    const before = await sql`select id, tier, inputs_hash, explanation from verdict`;
    const created = await POST(request("POST", valid), context());
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect(id).toBeTypeOf("number");
    expect(await sql`select guide, level, edition_year, url from distinction where id = ${id}`).toMatchObject([
      { guide: "Michelin", level: "Bib Gourmand", edition_year: 2026, url: valid.url },
    ]);
    expect(await sql`select id, tier, inputs_hash, explanation from verdict`).toEqual(before);

    const deleted = await DELETE(request("DELETE", { id }), context());
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    expect(await sql`select id from distinction where id = ${id}`).toEqual([]);
    expect(await sql`select id, tier, inputs_hash, explanation from verdict`).toEqual(before);
  });

  it("rejects invalid guide, level, year, URL and extra fields", async () => {
    for (const body of [
      { ...valid, guide: "Other" }, { ...valid, level: " " }, { ...valid, editionYear: 2026.5 },
      { ...valid, url: "javascript:alert(1)" }, { ...valid, extra: true },
    ]) {
      const response = await POST(request("POST", body), context());
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_request");
    }
    expect(await sql`select id from distinction`).toEqual([]);
  });

  it("returns 404 for an unknown Restaurant and a Distinction outside that Restaurant", async () => {
    expect((await POST(request("POST", valid), context("missing"))).status).toBe(404);
    const created = await POST(request("POST", valid), context());
    const { id } = await created.json();
    expect((await DELETE(request("DELETE", { id }), context("missing"))).status).toBe(404);
    expect((await sql`select id from distinction where id = ${id}`).length).toBe(1);
    await DELETE(request("DELETE", { id }), context());
  });

  it("rejects invalid delete input and malformed JSON", async () => {
    expect((await DELETE(request("DELETE", { id: -1 }), context())).status).toBe(400);
    const response = await POST(new Request("http://localhost/api/v1/restaurants/sample/distinctions", { method: "POST", body: "{" }), context());
    expect(response.status).toBe(400);
  });
});
