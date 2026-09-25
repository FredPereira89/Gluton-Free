import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import fixture from "./fixtures/lookup.json";
import privacy from "./fixtures/privacy.json";
import { fakeAnthropic, fakeVendorFetch } from "./vendor-fakes";

vi.mock("@/analysis/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/analysis/llm")>();
  return {
    ...original,
    anthropic: () => ({
      messages: {
        ...fakeAnthropic.messages,
        create: async (params: Parameters<typeof fakeAnthropic.messages.create>[0]) => {
          const response = await fakeAnthropic.messages.create(params);
          const output = JSON.parse(response.content[0]!.text);
          for (const review of output.reviews ?? []) review.names = ["Invented Staff Text PII"];
          return { ...response, content: [{ type: "text", text: JSON.stringify(output) }] };
        },
      },
    }),
  };
});

let containerId: string | undefined;
let sql: postgres.Sql | undefined;
const oldUrl = process.env.SUPABASE_DB_URL;
const oldLogin = process.env.DATAFORSEO_LOGIN;
const oldPassword = process.env.DATAFORSEO_PASSWORD;
const unexpectedRequests: string[] = [];
const logSpies: ReturnType<typeof vi.spyOn>[] = [];
const logged: unknown[] = [];

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function privacyVendorFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  if (url.pathname.includes("/storage/v1/")) unexpectedRequests.push(url.pathname);
  const response = await fakeVendorFetch(input, init);
  if (!url.pathname.includes("/task_get/")) return response;
  const body = await response.json();
  const result = body.tasks?.[0]?.result?.[0];
  if (!result) return new Response(JSON.stringify(body));
  result.raw_payload_marker = privacy.rawMarker;
  if (url.pathname.includes("/google/")) {
    Object.assign(result.items[0], privacy.google, { raw_payload_marker: privacy.rawMarker });
    result.items[0].review_text += " Invented Staff Text PII guided us.";
    result.items.push(...privacy.thirdPartyReviews);
  } else {
    Object.assign(result.items[0], privacy.tripadvisor, { raw_payload_marker: privacy.rawMarker });
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await privacyVendorFetch(input, init);
    } catch (error) {
      unexpectedRequests.push(String(input));
      throw error;
    }
  });
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    logSpies.push(vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(...args); }));
  }
  process.env.DATAFORSEO_LOGIN = "invented-test-login";
  process.env.DATAFORSEO_PASSWORD = "invented-test-password";
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=pipeline-privacy-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  if (!port) throw new Error("Docker did not assign a Postgres port");
  process.env.SUPABASE_DB_URL = `postgres://postgres:pipeline-privacy-test-only@127.0.0.1:${port}/postgres`;
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
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
}, 180_000);

afterAll(async () => {
  try {
    await sql?.end();
    const { closeDb } = await import("@/lib/db");
    await closeDb();
  } finally {
    if (containerId) docker("stop", "--time", "0", containerId);
    for (const spy of logSpies) spy.mockRestore();
    vi.unstubAllGlobals();
    if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = oldUrl;
    if (oldLogin === undefined) delete process.env.DATAFORSEO_LOGIN;
    else process.env.DATAFORSEO_LOGIN = oldLogin;
    if (oldPassword === undefined) delete process.env.DATAFORSEO_PASSWORD;
    else process.env.DATAFORSEO_PASSWORD = oldPassword;
  }
});

describe("Lookup privacy", () => {
  it("stores only whitelisted Review fields and keeps identity, mixed-source Reviews, and raw payloads out of every table, Storage, and logs", async () => {
    const database = sql!;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-privacy-restaurant', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-google-place', 'https://example.invalid/google', 'pasted'),
             (${restaurantId}, 'tripadvisor', 'invented-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;

    const { runLookup } = await import("./lookup");
    const result = await runLookup(restaurantId, async () => {});
    expect(result.ingest?.google).toMatchObject({ inserted: 8, droppedThirdParty: 4 });
    expect(result.ingest?.tripadvisor).toMatchObject({ inserted: 8, droppedThirdParty: 0 });

    const reviews = await database`select * from review order by source_review_id`;
    expect(reviews).toHaveLength(16);
    expect(reviews.map((review) => review.source_review_id)).toEqual([
      ...Array.from({ length: 8 }, (_, index) => `invented-google-${index + 1}`),
      ...Array.from({ length: 8 }, (_, index) => `invented-tripadvisor-${index + 1}`),
    ]);
    expect(Object.keys(reviews[0]!).sort()).toEqual([
      "id", "listing_id", "source_review_id", "stars", "published_at", "language", "text",
      "sub_ratings", "reviewer_review_count", "local_guide", "reviewer_contributions",
      "photo_count", "visited_on", "owner_replied", "fetched_at",
    ].sort());
    expect(reviews.find((review) => review.source_review_id === "invented-google-1")).toMatchObject({
      stars: 5, language: "en", owner_replied: true,
    });
    expect(reviews.find((review) => review.source_review_id === "invented-tripadvisor-1")).toMatchObject({
      stars: 5, reviewer_contributions: 7, owner_replied: true,
    });

    const forbidden = [
      privacy.rawMarker,
      privacy.google.profile_name, privacy.google.profile_id, privacy.google.profile_image_url,
      privacy.google.profile_url, privacy.google.review_url, privacy.google.owner_answer,
      privacy.google.original_owner_answer,
      privacy.tripadvisor.user_profile.id, privacy.tripadvisor.user_profile.name,
      privacy.tripadvisor.user_profile.avatar, privacy.tripadvisor.user_profile.profile_url,
      privacy.tripadvisor.url, privacy.tripadvisor.responses[0]!.text,
      privacy.tripadvisor.responses[0]!.staff_name, "Invented Staff Text PII",
      ...privacy.thirdPartyReviews.map((review) => review.review_text),
      ...privacy.thirdPartyReviews.map((review) => review.review_id),
    ];
    const tables = await database`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    for (const { tablename } of tables) {
      const rows = await database`select to_jsonb(t) as data from ${database(tablename as string)} t`;
      for (const row of rows) {
        const stored = JSON.stringify(row.data);
        for (const value of forbidden) expect(stored, `${tablename} contains ${value}`).not.toContain(value);
      }
    }
    const output = JSON.stringify(logged);
    for (const value of forbidden) expect(output, `logs contain ${value}`).not.toContain(value);
    expect(unexpectedRequests).toEqual([]);
  }, 30_000);
});
