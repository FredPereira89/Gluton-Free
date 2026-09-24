import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import fixture from "./fixtures/lookup.json";
import { fakeVendorFetch } from "./vendor-fakes";

vi.mock("@/analysis/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/analysis/llm")>();
  const { fakeAnthropic } = await import("./vendor-fakes");
  return { ...original, anthropic: () => fakeAnthropic };
});

let containerId: string | undefined;
let sql: postgres.Sql | undefined;
const oldUrl = process.env.SUPABASE_DB_URL;
const oldLogin = process.env.DATAFORSEO_LOGIN;
const oldPassword = process.env.DATAFORSEO_PASSWORD;

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeVendorFetch);
  process.env.DATAFORSEO_LOGIN = "invented-test-login";
  process.env.DATAFORSEO_PASSWORD = "invented-test-password";
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=pipeline-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  if (!port) throw new Error("Docker did not assign a Postgres port");
  process.env.SUPABASE_DB_URL = `postgres://postgres:pipeline-test-only@127.0.0.1:${port}/postgres`;
  sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, connect_timeout: 1 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await sql`select 1`;
      break;
    } catch {
      if (attempt === 99) throw new Error("Disposable Postgres did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}, 180_000);

afterAll(async () => {
  try {
    await sql?.end();
    const { closeDb } = await import("@/lib/db");
    await closeDb();
  } finally {
    if (containerId) docker("stop", "--time", "0", containerId);
    vi.unstubAllGlobals();
    if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = oldUrl;
    if (oldLogin === undefined) delete process.env.DATAFORSEO_LOGIN;
    else process.env.DATAFORSEO_LOGIN = oldLogin;
    if (oldPassword === undefined) delete process.env.DATAFORSEO_PASSWORD;
    else process.env.DATAFORSEO_PASSWORD = oldPassword;
  }
});

describe("Lookup pipeline", () => {
  it("stores invented Reviews and analyses, issues a Verdict, and records the job cost", async () => {
    const database = sql!;
    const migrations = await database`select name from schema_migration order by name`;
    expect(migrations.map((migration) => migration.name)).toEqual(readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort());
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-copper-spoon', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only')`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-google-place', 'https://example.invalid/google', 'pasted'),
             (${restaurantId}, 'tripadvisor', 'invented-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;

    const { runLookup } = await import("./lookup");
    const result = await runLookup(restaurantId, async () => {});
    const reviews = await database`select source_review_id, text from review order by source_review_id`;
    const analyses = await database`select a.review_id from review_analysis a join review r on r.id = a.review_id join listing l on l.id = r.listing_id where l.restaurant_id = ${restaurantId}`;
    const [verdict] = await database`select state, tier, provisional, job_id from verdict where restaurant_id = ${restaurantId}`;
    const [job] = await database`select status, vendor_cost_usd, llm_usage from job where id = ${result.jobId}`;

    expect(reviews).toHaveLength(16);
    expect(reviews.every((review) => String(review.source_review_id).startsWith("invented-") && typeof review.text === "string")).toBe(true);
    expect(analyses).toHaveLength(16);
    expect(verdict).toMatchObject({ state: "verdict", provisional: true, job_id: String(result.jobId) });
    expect(verdict!.tier).not.toBeNull();
    expect(job!.status).toBe("succeeded");
    expect(Number(job!.vendor_cost_usd)).toBe(0.04);
    expect((job!.llm_usage as { purpose: string; cost_usd: number }[]).some((entry) => entry.purpose === "extract" && entry.cost_usd > 0)).toBe(true);
  }, 30_000);

  it("serves the invented Apify fixture and rejects every unknown external URL", async () => {
    const response = await fetch("https://api.apify.com/v2/datasets/invented/items");
    expect(await response.json()).toEqual(fixture.apify.items);
    await expect(fetch("https://unlisted-vendor.example/reviews")).rejects.toThrow("Unexpected external request");
  });
});
