import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { AuthError, requireOwner } from "@/lib/auth";
import { closeDb } from "@/lib/db";
import { spotCheckRate, spotCheckState } from "@/lib/baseline-spot-check";
import { POST as start } from "./start/route";
import { POST as answer } from "./answer/route";

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
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=spot-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  process.env.SUPABASE_DB_URL = `postgres://postgres:spot-test-only@127.0.0.1:${port}/postgres`;
  sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, connect_timeout: 1 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await sql`select 1`; break; }
    catch {
      if (attempt === 99) throw new Error("Disposable Postgres did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { cwd: process.cwd(), env: process.env });
  await sql`
    insert into restaurant (slug, name, city, format, format_provenance, baseline_sampled)
    select 'baseline-' || n, 'Baseline ' || n, 'Lisbon', 'tasca', 'llm', true
    from generate_series(1, 55) n`;
  await sql`
    insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
    select id, 'google', 'google-' || id, 'https://example.test/google/' || id, 'auto_accepted'
    from restaurant`;
  await sql`
    insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
    select id, 'tripadvisor', 'trip-' || id, 'https://example.test/trip/' || id, 'auto_accepted'
    from restaurant where id <= 35`;
}, 60_000);

afterAll(async () => {
  await closeDb();
  await sql?.end();
  if (containerId) docker("rm", "-f", containerId);
  if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL;
  else process.env.SUPABASE_DB_URL = oldUrl;
});

function postStart() {
  return new Request("http://localhost/baseline-checks/start", { method: "POST", headers: { origin: "http://localhost" } });
}

function postAnswer(id: number, value: string) {
  const body = new FormData();
  body.set("id", String(id));
  body.set("answer", value);
  return new Request("http://localhost/baseline-checks/answer", { method: "POST", headers: { origin: "http://localhost" }, body });
}

describe("baseline spot-check handlers", () => {
  it("draws and saves one random-sized checklist, then stores answers and reports both acceptance bars", async () => {
    expect((await start(postStart())).status).toBe(303);
    const first = await spotCheckState();
    expect(first.items.filter((item) => item.kind === "format")).toHaveLength(50);
    expect(first.items.filter((item) => item.kind === "tripadvisor_match")).toHaveLength(30);
    expect(new Set(first.items.map((item) => item.id)).size).toBe(80);
    expect((await start(postStart())).status).toBe(303);
    expect((await spotCheckState()).items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));

    for (const kind of ["format", "tripadvisor_match"] as const) {
      const group = first.items.filter((item) => item.kind === kind);
      for (const [index, item] of group.entries()) {
        expect((await answer(postAnswer(item.id, index === 0 ? "reject" : "confirm"))).status).toBe(303);
      }
    }
    const completed = await spotCheckState();
    expect(spotCheckRate(completed.items, "format")).toMatchObject({ answered: 50, confirmed: 49, rate: 98, passes: true });
    expect(spotCheckRate(completed.items, "tripadvisor_match")).toMatchObject({ answered: 30, confirmed: 29, passes: true });
    const rejected = completed.items.find((item) => item.agreed === false)!;
    expect((await answer(postAnswer(rejected.id, "confirm"))).status).toBe(303);
    expect((await spotCheckState()).items.find((item) => item.id === rejected.id)?.agreed).toBe(true);
  });

  it("rejects bad answers and requests without the owner session", async () => {
    const item = (await spotCheckState()).items[0]!;
    expect((await answer(postAnswer(item.id, "maybe"))).status).toBe(400);
    vi.mocked(requireOwner).mockRejectedValueOnce(new AuthError(401, "unauthenticated", "No session"));
    expect((await answer(postAnswer(item.id, "reject"))).status).toBe(401);
  });
});
