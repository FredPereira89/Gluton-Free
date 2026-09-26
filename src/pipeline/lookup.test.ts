import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import fixture from "./fixtures/lookup.json";
import { fakePushSends, fakeSendPush } from "./push-fake";
import { fakeAnthropic, fakeRestaurantFacts, fakeVendorCalls, fakeVendorFetch, sourceFetchFailureState, vendorFailureState } from "./vendor-fakes";

vi.mock("@/lib/push-send", () => ({ sendPush: (...args: Parameters<typeof fakeSendPush>) => fakeSendPush(...args) }));

const triggerControl = vi.hoisted(() => ({ failListingUndo: false }));

const extractFailureState: { armed: boolean } = { armed: false };
vi.mock("@/analysis/extract", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/analysis/extract")>();
  return {
    ...original,
    extractSync: async (...args: Parameters<typeof original.extractSync>) => {
      if (extractFailureState.armed) {
        extractFailureState.armed = false;
        throw new Error("invented Anthropic outage during extraction");
      }
      return original.extractSync(...args);
    },
  };
});

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), requireOwner: vi.fn().mockResolvedValue("owner"),
}));
vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn(async (id: string, payload: never) => {
  if (id === "owner-listing-undo" && triggerControl.failListingUndo) throw new Error("Trigger unavailable");
  const { runLookup, runListingFetch, runRejudge, runSourceRetry } = await import("./lookup");
  if (id === "owner-format-correction") {
    // The API commits before Trigger.dev begins processing the queued correction.
  } else if (id === "owner-listing-answer") {
    const p = payload as { restaurantId: number; listingId: number; fetchJobId: number };
    await runListingFetch(p.restaurantId, p.listingId, async () => {}, { jobId: p.fetchJobId });
    await runRejudge(p.restaurantId, async () => {}, { cause: "owner_answer" });
  } else if (id === "owner-listing-undo") {
    // The worker waits for the API transaction to commit before reading the detached Listing set.
  } else if (id === "owner-change-point") {
    // The worker waits for the API transaction (the Change point insert/delete) to commit before re-judging.
  } else if (id === "owner-source-retry") {
    const p = payload as { restaurantId: number; listingId: number; questionId: number; jobId: number };
    await runSourceRetry(p.restaurantId, p.listingId, p.questionId, async () => {}, { jobId: p.jobId });
  } else {
    const p = payload as { restaurantId: number; jobId: number; from?: "ingest" | "extract" | "judge" };
    await runLookup(p.restaurantId, async () => {}, { jobId: p.jobId, from: p.from });
  }
  return { id: "invented-trigger-run" };
}) } }));

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
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-google-place', 'https://example.invalid/google', 'pasted'),
             (${restaurantId}, 'tripadvisor', 'invented-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;

    const { runLookup } = await import("./lookup");
    const result = await runLookup(restaurantId, async () => {});
    const reviews = await database`select source_review_id, text from review order by source_review_id`;
    const analyses = await database`select a.review_id, a.change from review_analysis a join review r on r.id = a.review_id join listing l on l.id = r.listing_id where l.restaurant_id = ${restaurantId}`;
    const [verdict] = await database`select state, tier, provisional, job_id from verdict where restaurant_id = ${restaurantId}`;
    const [job] = await database`select status, vendor_cost_usd, llm_usage from job where id = ${result.jobId}`;

    expect(reviews).toHaveLength(16);
    expect(reviews.every((review) => String(review.source_review_id).startsWith("invented-") && typeof review.text === "string")).toBe(true);
    expect(analyses).toHaveLength(16);
    expect(analyses.every((analysis) => analysis.change === "new_owner")).toBe(true);
    expect(verdict).toMatchObject({ state: "verdict", provisional: true, job_id: String(result.jobId) });
    expect(verdict!.tier).not.toBeNull();
    expect(job!.status).toBe("succeeded");
    expect(Number(job!.vendor_cost_usd)).toBe(0.04);
    expect((job!.llm_usage as { purpose: string; cost_usd: number }[]).some((entry) => entry.purpose === "extract" && entry.cost_usd > 0)).toBe(true);

    const [first] = await database`select explanation, inputs_hash from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
    const parse = vi.spyOn(fakeAnthropic.messages, "parse");
    const { issueVerdict } = await import("@/verdict/issue");
    const { emptyUsage, JUDGE_MODEL } = await import("@/analysis/llm");
    await issueVerdict(restaurantId, null, emptyUsage("explain", JUDGE_MODEL, false), "automatic");
    const [second] = await database`select explanation, inputs_hash from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
    expect(second).toMatchObject(first!);
    expect(parse).not.toHaveBeenCalled();

    const [review] = await database`select r.id from review r join listing l on l.id = r.listing_id where l.restaurant_id = ${restaurantId} order by r.id limit 1`;
    await database`insert into review_flag (review_id, type, flag_group, first_hand, severity, evidence, verification)
      values (${review!.id}, 'hygiene', 'health', true, 'medium', 'Invented hygiene report', 'confirmed')`;
    await issueVerdict(restaurantId, null, emptyUsage("explain", JUDGE_MODEL, false), "automatic");
    const [changed] = await database`select explanation, inputs_hash from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
    expect(changed!.inputs_hash).not.toBe(second!.inputs_hash);
    expect(changed!.explanation).toMatch(/health Red flag: 1 verified incident/);
    expect(parse).toHaveBeenCalledTimes(2);

    await database`update review_analysis set quote = 'A revised invented quote about the food.', quote_aspect = 'food', quote_polarity = 1 where review_id = ${review!.id}`;
    await issueVerdict(restaurantId, null, emptyUsage("explain", JUDGE_MODEL, false), "automatic");
    const [withQuote] = await database`select inputs_hash, blocks from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
    expect(withQuote!.inputs_hash).not.toBe(changed!.inputs_hash);
    expect(parse).toHaveBeenCalledTimes(4);
    expect((withQuote!.blocks as { quotes: { text: string; access: string }[] }).quotes).toContainEqual(expect.objectContaining({
      text: "A revised invented quote about the food.", access: "personal_only",
    }));
    const [portuguese] = await database`
      insert into review (listing_id, source_review_id, stars, published_at, language, text)
      select listing_id, 'invented-pt-quote', 4, now(), 'pt', 'A comida estava muito saborosa e o serviço foi atencioso.'
      from review where id = ${review!.id} returning id`;
    await database`
      insert into review_analysis (review_id, extractor_version, exceptional, quote, quote_aspect, quote_polarity)
      values (${portuguese!.id}, 'test', 'none', 'A comida estava muito saborosa e o serviço foi atencioso.', 'food', 1)`;
    await issueVerdict(restaurantId, null, emptyUsage("explain", JUDGE_MODEL, false), "automatic");
    const translateCall = vi.spyOn(fakeAnthropic.messages, "create").mockResolvedValue({
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "text", text: "An invented English food quote." }],
    } as never);
    const { translateQuote } = await import("@/verdict/translate");
    const original = "A comida estava muito saborosa e o serviço foi atencioso.";
    await expect(translateQuote("fictional-copper-spoon", Number(portuguese!.id), "Another quote"))
      .rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(await translateQuote("fictional-copper-spoon", Number(portuguese!.id), original)).toBe("An invented English food quote.");
    expect(await translateQuote("fictional-copper-spoon", Number(portuguese!.id), original)).toBe("An invented English food quote.");
    expect(translateCall).toHaveBeenCalledTimes(1);
    const [cached] = await database`select quote_en from review_analysis where review_id = ${portuguese!.id}`;
    expect(cached!.quote_en).toBe("An invented English food quote.");
    const { loadRestaurantBundle } = await import("@/web/data");
    const page = await loadRestaurantBundle("fictional-copper-spoon");
    expect(page!.verdict!.blocks.quotes).toContainEqual(expect.objectContaining({
      reviewId: Number(portuguese!.id), textEn: "An invented English food quote.", access: "personal_only",
    }));
    await database`update review_analysis set quote = 'Uma nova citação após reanálise.', quote_en = null where review_id = ${portuguese!.id}`;
    await expect(translateQuote("fictional-copper-spoon", Number(portuguese!.id), original))
      .rejects.toMatchObject({ status: 409, code: "stale_quote" });
    expect(translateCall).toHaveBeenCalledTimes(1);
    translateCall.mockRestore();
    parse.mockRestore();
  }, 30_000);

  it("issues a Low-Confidence partial Verdict and retries only the failed Source", async () => {
    const database = sql!;
    const originalGoogleLength = fixture.googleReviews.length;
    fixture.googleReviews.push(...Array.from({ length: 8 }, (_, index) => `Invented extra Google Review ${index + 1} praises the food.`));
    try {
      const [restaurant] = await database`
        insert into restaurant (slug, name, city, format, format_provenance)
        values ('fictional-partial-lookup', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
      const restaurantId = Number(restaurant!.id);
      await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
      await database`
        insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
        values (${restaurantId}, 'google', 'invented-partial-google-place', 'https://example.invalid/google', 'pasted'),
               (${restaurantId}, 'tripadvisor', 'invented-partial-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;

      sourceFetchFailureState.source = "tripadvisor";
      sourceFetchFailureState.taskGetFailures = 3;
      const { runLookup } = await import("./lookup");
      const initial = await runLookup(restaurantId, async () => {});
      expect(sourceFetchFailureState.taskGetFailures).toBe(0);

      const [job] = await database`select status from job where id = ${initial.jobId}`;
      expect(job!.status).toBe("succeeded");
      const [tripadvisor] = await database`select fetch_status from listing where restaurant_id = ${restaurantId} and source_code = 'tripadvisor'`;
      expect(tripadvisor!.fetch_status).toBe("failed");
      const [verdict] = await database`select state, confidence, blocks from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
      expect(verdict).toMatchObject({ state: "verdict", confidence: "low" });
      expect((verdict!.blocks as { rollup: { confidence: { level: string } } }).rollup.confidence.level).toBe("low");
      const [question] = await database`select id, status, source_code, kind from owner_question where restaurant_id = ${restaurantId}`;
      expect(question).toMatchObject({ status: "open", source_code: "tripadvisor", kind: "retry_source" });

      const { loadRestaurantBundle } = await import("@/web/data");
      const partialPage = await loadRestaurantBundle("fictional-partial-lookup");
      expect(partialPage?.ownerQuestions).toMatchObject([{ kind: "retry_source", source: "tripadvisor", prompt: "Retry Tripadvisor" }]);
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { default: VerdictPageRoute } = await import("@/app/r/[slug]/page");
      const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "fictional-partial-lookup" }) }));
      expect(html).toContain("Tripadvisor could not be fetched.");
      expect(html).toContain("Retry Tripadvisor");

      const { POST } = await import("@/app/api/v1/restaurants/[slug]/listings/[source]/retry/route");
      const response = await POST(new Request("http://localhost/api/v1/restaurants/fictional-partial-lookup/listings/tripadvisor/retry", { method: "POST" }), {
        params: Promise.resolve({ slug: "fictional-partial-lookup", source: "tripadvisor" }),
      });
      expect(response.status).toBe(202);
      const [retriedListing] = await database`select fetch_status from listing where restaurant_id = ${restaurantId} and source_code = 'tripadvisor'`;
      expect(retriedListing!.fetch_status).toBe("fetched");
      const [verdictCount] = await database`select count(*)::int as count from verdict where restaurant_id = ${restaurantId}`;
      expect(verdictCount!.count).toBe(2);
      const [settled] = await database`select status from owner_question where id = ${question!.id}`;
      expect(settled!.status).toBe("answered");
      expect((await loadRestaurantBundle("fictional-partial-lookup"))?.ownerQuestions).toEqual([]);
    } finally {
      fixture.googleReviews.splice(originalGoogleLength);
      sourceFetchFailureState.source = null;
      sourceFetchFailureState.taskPostFailures = 0;
      sourceFetchFailureState.taskGetFailures = 0;
    }
  }, 30_000);

  it("retries transient Source task submission errors before marking the Source failed", async () => {
    const database = sql!;
    const beforePosts = fakeVendorCalls.reviewPosts;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-source-post-retry', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-source-post-retry-google-place', 'https://example.invalid/google', 'pasted')`;

    sourceFetchFailureState.source = "google";
    sourceFetchFailureState.taskPostFailures = 2;
    try {
      const { runLookup } = await import("./lookup");
      const result = await runLookup(restaurantId, async () => {});
      expect(sourceFetchFailureState.taskPostFailures).toBe(0);
      expect(fakeVendorCalls.reviewPosts).toBe(beforePosts + 2);
      const [listing] = await database`select fetch_status from listing where restaurant_id = ${restaurantId}`;
      expect(listing!.fetch_status).toBe("fetched");
      const [job] = await database`select status from job where id = ${result.jobId}`;
      expect(job!.status).toBe("succeeded");
    } finally {
      sourceFetchFailureState.source = null;
      sourceFetchFailureState.taskPostFailures = 0;
    }
  }, 30_000);

  it("re-judges a fetched Source after an extraction failure without fetching it twice", async () => {
    const database = sql!;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-partial-retry-recovery', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-recovery-google-place', 'https://example.invalid/google', 'pasted'),
             (${restaurantId}, 'tripadvisor', 'invented-recovery-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;

    sourceFetchFailureState.source = "tripadvisor";
    sourceFetchFailureState.taskGetFailures = 3;
    const { runLookup } = await import("./lookup");
    await runLookup(restaurantId, async () => {});
    sourceFetchFailureState.source = null;
    const [question] = await database`select id from owner_question where restaurant_id = ${restaurantId} and kind = 'retry_source'`;
    const postsBeforeRetry = fakeVendorCalls.reviewPosts;
    extractFailureState.armed = true;

    const { POST } = await import("@/app/api/v1/restaurants/[slug]/listings/[source]/retry/route");
    const request = () => POST(
      new Request("http://localhost/api/v1/restaurants/fictional-partial-retry-recovery/listings/tripadvisor/retry", { method: "POST" }),
      { params: Promise.resolve({ slug: "fictional-partial-retry-recovery", source: "tripadvisor" }) },
    );
    const failedRetry = await request();
    expect(failedRetry.status).toBe(500);
    const [afterFailure] = await database`select fetch_status from listing where restaurant_id = ${restaurantId} and source_code = 'tripadvisor'`;
    expect(afterFailure!.fetch_status).toBe("fetched");
    const [openQuestion] = await database`select status from owner_question where id = ${question!.id}`;
    expect(openQuestion!.status).toBe("open");

    const recovered = await request();
    expect(recovered.status).toBe(202);
    expect(fakeVendorCalls.reviewPosts).toBe(postsBeforeRetry + 2);
    const [verdictCount] = await database`select count(*)::int as count from verdict where restaurant_id = ${restaurantId}`;
    expect(verdictCount!.count).toBe(2);
    const [settled] = await database`select status from owner_question where id = ${question!.id}`;
    expect(settled!.status).toBe("answered");
  }, 30_000);

  it("undoes an auto-accepted Listing and appends a Verdict from the remaining Sources", async () => {
    const database = sql!;
    await database`insert into source (code, name, kind, access) values
      ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only')
      on conflict (code) do nothing`;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance, price_tier, price_provenance)
      values ('fictional-undo-auto-match', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner', '€', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    const [google] = await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-undo-google-place', 'https://example.invalid/google', 'auto_accepted') returning id`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'tripadvisor', 'invented-undo-tripadvisor-path', 'https://example.invalid/tripadvisor', 'proposed_confirmed')`;

    const { runLookup } = await import("./lookup");
    await runLookup(restaurantId, async () => {});
    const [before] = await database`select count(*)::int as n from verdict where restaurant_id = ${restaurantId}`;
    expect(before!.n).toBe(1);
    const [flaggedReview] = await database`select id from review where listing_id = ${google!.id} order by id limit 1`;
    await database`insert into review_flag (review_id, type, flag_group, first_hand, severity, evidence, verification)
      values (${flaggedReview!.id}, 'hygiene', 'health', true, 'low', 'Invented source-specific flag', 'rejected')`;

    const { DELETE } = await import("@/app/api/v1/restaurants/[slug]/listings/[source]/route");
    triggerControl.failListingUndo = true;
    const failedStart = await DELETE(
      new Request("http://localhost/api/v1/restaurants/fictional-undo-auto-match/listings/google", { method: "DELETE" }),
      { params: Promise.resolve({ slug: "fictional-undo-auto-match", source: "google" }) },
    );
    triggerControl.failListingUndo = false;
    expect(failedStart.status).toBe(503);
    const [stillAttached] = await database`select id from listing where id = ${google!.id}`;
    expect(stillAttached).toBeDefined();
    const [reviewCountAfterFailure] = await database`select count(*)::int as n from review where listing_id = ${google!.id}`;
    expect(reviewCountAfterFailure!.n).toBe(8);
    const [activeRejudge] = await database`select id from job where restaurant_id = ${restaurantId} and kind = 'rejudge' and status in ('queued', 'running')`;
    expect(activeRejudge).toBeUndefined();

    const response = await DELETE(
      new Request("http://localhost/api/v1/restaurants/fictional-undo-auto-match/listings/google", { method: "DELETE" }),
      { params: Promise.resolve({ slug: "fictional-undo-auto-match", source: "google" }) },
    );
    expect(response.status).toBe(202);
    const { routes } = await import("@/lib/api-contract");
    const accepted = routes.undoListing.responses[202].parse(await response.json());
    const { runRejudge } = await import("./lookup");
    await runRejudge(restaurantId, async () => {}, { jobId: accepted.id, cause: "owner_answer" });

    const listings = await database`select source_code from listing where restaurant_id = ${restaurantId} order by source_code`;
    expect(listings.map((listing) => listing.source_code)).toEqual(["tripadvisor"]);
    const reviews = await database`
      select l.source_code, count(*)::int as n from review r join listing l on l.id = r.listing_id
      where l.restaurant_id = ${restaurantId} group by l.source_code`;
    expect(reviews).toEqual([{ source_code: "tripadvisor", n: 8 }]);
    const sourceFlags = await database`
      select f.id from review_flag f join review r on r.id = f.review_id join listing l on l.id = r.listing_id
      where l.restaurant_id = ${restaurantId} and l.source_code = 'google'`;
    expect(sourceFlags).toEqual([]);
    const [after] = await database`select count(*)::int as n from verdict where restaurant_id = ${restaurantId}`;
    expect(after!.n).toBe(2);
    const [latest] = await database`select blocks from verdict where restaurant_id = ${restaurantId} order by id desc limit 1`;
    const perSource = (latest!.blocks as { rollup: { counts: { perSource: Record<string, unknown> } } }).rollup.counts.perSource;
    expect(perSource).not.toHaveProperty("google");
    expect(perSource).toHaveProperty("tripadvisor");
    const [job] = await database`select status from job where id = ${accepted.id}`;
    expect(job!.status).toBe("succeeded");

    const refused = await DELETE(
      new Request("http://localhost/api/v1/restaurants/fictional-undo-auto-match/listings/tripadvisor", { method: "DELETE" }),
      { params: Promise.resolve({ slug: "fictional-undo-auto-match", source: "tripadvisor" }) },
    );
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("not_auto_accepted");
    const [tripadvisor] = await database`select 1 from listing where restaurant_id = ${restaurantId} and source_code = 'tripadvisor'`;
    expect(tripadvisor).toBeDefined();
  }, 30_000);

  it("retries a failed extraction stage without a second vendor charge", async () => {
    const database = sql!;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-retry-bistro', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-retry-google-place', 'https://example.invalid/google', 'pasted'),
             (${restaurantId}, 'tripadvisor', 'invented-retry-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;

    const { runLookup } = await import("./lookup");
    extractFailureState.armed = true;
    await expect(runLookup(restaurantId, async () => {})).rejects.toThrow("invented Anthropic outage during extraction");
    expect(extractFailureState.armed).toBe(false);

    const [failed] = await database`
      select id, status, error_code, error_detail, failed_stage, vendor_cost_usd from job
      where restaurant_id = ${restaurantId} order by id desc limit 1`;
    expect(failed).toMatchObject({ status: "failed", error_code: "internal_error", failed_stage: "extract" });
    expect(failed!.error_detail).not.toMatch(/Anthropic|outage/i);
    const vendorCostAfterFailure = Number(failed!.vendor_cost_usd);
    expect(vendorCostAfterFailure).toBeGreaterThan(0);

    const [question] = await database`select payload from owner_question where restaurant_id = ${restaurantId} and kind = 'failed_lookup'`;
    expect(question!.payload).toMatchObject({ jobId: Number(failed!.id), code: "internal_error", detail: failed!.error_detail });

    const retried = await runLookup(restaurantId, async () => {}, { jobId: Number(failed!.id), from: "extract" });
    const [succeeded] = await database`select status, vendor_cost_usd from job where id = ${retried.jobId}`;
    expect(succeeded!.status).toBe("succeeded");
    expect(Number(succeeded!.vendor_cost_usd)).toBe(vendorCostAfterFailure);
  }, 30_000);

  it("classifies a DataForSEO balance error into a plain-words code and detail, never the vendor payload", async () => {
    const database = sql!;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-balance-diner', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-balance-google-place', 'https://example.invalid/google', 'pasted')`;

    const { runLookup } = await import("./lookup");
    vendorFailureState.armed = true;
    await expect(runLookup(restaurantId, async () => {})).rejects.toThrow(/balance/i);
    expect(vendorFailureState.armed).toBe(false);

    const [job] = await database`
      select id, status, error_code, error_detail, failed_stage, vendor_cost_usd from job
      where restaurant_id = ${restaurantId} order by id desc limit 1`;
    expect(job).toMatchObject({ status: "failed", error_code: "vendor_balance_low", failed_stage: "ingest" });
    expect(job!.error_detail).toBe("DataForSEO balance $0.03, this lookup needs about $0.12. Top up then retry.");
    expect(job!.error_detail).not.toMatch(/status_code|task_post|api\.dataforseo|Authorization/i);
    expect(Number(job!.vendor_cost_usd)).toBe(0);

    const [question] = await database`select payload from owner_question where restaurant_id = ${restaurantId} and kind = 'failed_lookup'`;
    expect(Object.keys(question!.payload as object).sort()).toEqual(["code", "detail", "jobId"]);
    expect(question!.payload).toMatchObject({ jobId: Number(job!.id), code: "vendor_balance_low" });

    const { GET } = await import("@/app/api/v1/jobs/[id]/route");
    const { routes } = await import("@/lib/api-contract");
    const jobResponse = await GET(new Request(`http://localhost/api/v1/jobs/${job!.id}`), { params: Promise.resolve({ id: String(job!.id) }) });
    const parsed = routes.job.responses[200].parse(await jobResponse.json());
    expect(parsed.status).toBe("failed");
    expect(parsed.error).toEqual({ code: "vendor_balance_low", detail: job!.error_detail });
  }, 30_000);

  it("resumes a failed Lookup through POST /api/v1/jobs/:id/retry", async () => {
    const database = sql!;
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-retry-api-diner', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const restaurantId = Number(restaurant!.id);
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only') on conflict (code) do nothing`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurantId}, 'google', 'invented-retry-api-google-place', 'https://example.invalid/google', 'pasted')`;

    const { runLookup } = await import("./lookup");
    extractFailureState.armed = true;
    await expect(runLookup(restaurantId, async () => {})).rejects.toThrow();
    const [failed] = await database`select id from job where restaurant_id = ${restaurantId} order by id desc limit 1`;

    const { POST } = await import("@/app/api/v1/jobs/[id]/retry/route");
    const retry = () => POST(new Request(`http://localhost/api/v1/jobs/${failed!.id}/retry`, { method: "POST" }), { params: Promise.resolve({ id: String(failed!.id) }) });
    const response = await retry();
    expect(response.status).toBe(202);

    const [succeeded] = await database`select status from job where id = ${failed!.id}`;
    expect(succeeded!.status).toBe("succeeded");

    const again = await retry();
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("not_failed");
  }, 30_000);

  it("serves the invented Apify fixture and rejects every unknown external URL", async () => {
    const response = await fetch("https://api.apify.com/v2/datasets/invented/items");
    expect(await response.json()).toEqual(fixture.apify.items);
    await expect(fetch("https://unlisted-vendor.example/reviews")).rejects.toThrow("Unexpected external request");
  });

  it("starts a Lookup through POST, exposes its Job and Verdict, and reuses it on a second POST", async () => {
    const originalGoogle = [...fixture.googleReviews];
    fixture.googleReviews.push(...originalGoogle);
    try {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const { GET } = await import("@/app/api/v1/jobs/[id]/route");
    const { routes } = await import("@/lib/api-contract");
    const request = () => new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-second-place", listings: [{
        source: "tripadvisor", url: "https://www.tripadvisor.com/invented-second-path", placeRef: "invented-second-path", name: fixture.restaurant,
        confidence: "confident", autoAccept: true, reviewCount: 8,
        evidence: { distanceMeters: 10, phoneMatch: true, nameSimilarity: 1 },
      }] }),
    });
    const first = await POST(request());
    expect(first.status).toBe(202);
    const started = routes.startLookup.responses[202].parse(await first.json());
    expect(started.restaurantSlug).toBe("fictional-copper-spoon-mouraria");
    const jobResponse = await GET(new Request(`http://localhost/api/v1/jobs/${started.jobId}`), { params: Promise.resolve({ id: String(started.jobId) }) });
    expect(jobResponse.status).toBe(200);
    expect(jobResponse.headers.get("cache-control")).toContain("no-store");
    const job = routes.job.responses[200].parse(await jobResponse.json());
    expect(job.status).toBe("succeeded");
    expect(job.steps.every((step) => step.status === "done")).toBe(true);
    expect(job.vendorUsd).toBeGreaterThan(0);
    expect(job.llmUsd).toBeGreaterThan(0);
    expect(job.sources.map((source) => source.fetchedCount)).toEqual([16]);
    expect(job.facts.askLater).toEqual([expect.objectContaining({ source: "tripadvisor" })]);
    const [verdict] = await sql!`select state, job_id from verdict where job_id = ${started.jobId}`;
    expect(verdict).toMatchObject({ state: "verdict", job_id: String(started.jobId) });
    const second = await POST(request());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(started);
    const { tasks } = await import("@trigger.dev/sdk");
    expect(tasks.trigger).toHaveBeenCalledTimes(1);
    expect(tasks.trigger).toHaveBeenCalledWith("restaurant-lookup", expect.objectContaining({ jobId: started.jobId }), { idempotencyKey: `lookup-${started.jobId}` });
    } finally {
      fixture.googleReviews.splice(originalGoogle.length);
    }
  }, 30_000);

  it("sends exactly one push per pipeline event, with the minimal payload", async () => {
    const database = sql!;
    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
    const { runLookup } = await import("./lookup");

    fakePushSends.length = 0;
    const [verdictRestaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-push-verdict', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const verdictRestaurantId = Number(verdictRestaurant!.id);
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${verdictRestaurantId}, 'google', 'invented-push-verdict-google-place', 'https://example.invalid/google', 'pasted'),
             (${verdictRestaurantId}, 'tripadvisor', 'invented-push-verdict-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;
    await runLookup(verdictRestaurantId, async () => {});
    expect(fakePushSends).toEqual([{ kind: "verdict_ready", restaurantId: verdictRestaurantId, questionId: undefined }]);

    fakePushSends.length = 0;
    const [failedRestaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values ('fictional-push-failed', ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    const failedRestaurantId = Number(failedRestaurant!.id);
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${failedRestaurantId}, 'google', 'invented-push-failed-google-place', 'https://example.invalid/google', 'pasted'),
             (${failedRestaurantId}, 'tripadvisor', 'invented-push-failed-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;
    extractFailureState.armed = true;
    await expect(runLookup(failedRestaurantId, async () => {})).rejects.toThrow();
    expect(fakePushSends).toEqual([{ kind: "lookup_failed", restaurantId: failedRestaurantId, questionId: undefined }]);

    fakePushSends.length = 0;
    try {
      fakeRestaurantFacts.googleCategoryDisagrees = true;
      const { POST } = await import("@/app/api/v1/lookups/route");
      const started = await POST(new Request("http://localhost/api/v1/lookups", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ googlePlaceId: "invented-push-format-place", listings: [] }),
      }));
      expect(started.status).toBe(202);
      const { restaurantSlug } = await started.json() as { restaurantSlug: string };
      const [formatRestaurant] = await database`select id from restaurant where slug = ${restaurantSlug}`;
      const formatRestaurantId = Number(formatRestaurant!.id);
      const [formatQuestion] = await database`select id from owner_question where restaurant_id = ${formatRestaurantId} and kind = 'format'`;
      expect(fakePushSends).toEqual([
        { kind: "owner_question", restaurantId: formatRestaurantId, questionId: Number(formatQuestion!.id) },
        { kind: "verdict_ready", restaurantId: formatRestaurantId, questionId: undefined },
      ]);
    } finally {
      fakeRestaurantFacts.googleCategoryDisagrees = false;
    }

    fakePushSends.length = 0;
    const { POST } = await import("@/app/api/v1/lookups/route");
    const startedListing = await POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-push-listing-place", listings: [{
        source: "tripadvisor", url: "https://www.tripadvisor.com/invented-push-listing-path",
        placeRef: "invented-push-listing-path", name: fixture.restaurant,
        confidence: "uncertain", autoAccept: false, reviewCount: 8,
        evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: 0.9 },
      }] }),
    }));
    expect(startedListing.status).toBe(202);
    const { restaurantSlug: listingSlug } = await startedListing.json() as { restaurantSlug: string };
    const [listingRestaurant] = await database`select id from restaurant where slug = ${listingSlug}`;
    const listingRestaurantId = Number(listingRestaurant!.id);
    const [listingQuestion] = await database`select id from owner_question where restaurant_id = ${listingRestaurantId} and kind = 'listing_match'`;
    expect(fakePushSends[0]).toEqual({ kind: "owner_question", restaurantId: listingRestaurantId, questionId: Number(listingQuestion!.id) });
    expect(fakePushSends).toContainEqual({ kind: "verdict_ready", restaurantId: listingRestaurantId, questionId: undefined });
  }, 30_000);

  it("reads Format from Reviews before issuing the Verdict and shows its proposal", async () => {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const response = await POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-format-place", listings: [] }),
    }));
    expect(response.status).toBe(202);
    const { restaurantSlug } = await response.json() as { restaurantSlug: string };
    const [restaurant] = await sql!`select id, format, format_provenance, format_changed_at, price_tier, price_provenance from restaurant where slug = ${restaurantSlug}`;
    expect(restaurant).toMatchObject({ format: "tasca", format_provenance: "llm", price_tier: "€€", price_provenance: "source" });
    const [verdict] = await sql!`select id from verdict where restaurant_id = ${restaurant!.id}`;
    expect(verdict).toBeDefined();
    const { loadRestaurantBundle } = await import("@/web/data");
    const page = await loadRestaurantBundle(restaurantSlug);
    expect(page?.restaurant.formatProvenance).toBe("llm");
    expect(page?.ownerQuestions).toEqual([]);
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: VerdictPageRoute } = await import("@/app/r/[slug]/page");
    const html = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: restaurantSlug }) }));
    expect(html).toContain("Tasca (proposed)");

    const { runLookup } = await import("./lookup");
    await runLookup(Number(restaurant!.id), async () => {}, { from: "judge" });
    const [unchanged] = await sql!`select format_changed_at from restaurant where id = ${restaurant!.id}`;
    expect(unchanged!.format_changed_at).toEqual(restaurant!.format_changed_at);

    await sql!`update restaurant set format = 'fine_dining', format_provenance = 'owner' where id = ${restaurant!.id}`;
    await sql!`update listing set price_level = null where restaurant_id = ${restaurant!.id}`;
    await runLookup(Number(restaurant!.id), async () => {}, { from: "judge" });
    const [after] = await sql!`select format, format_provenance, price_tier, price_provenance from restaurant where id = ${restaurant!.id}`;
    expect(after).toMatchObject({ format: "fine_dining", format_provenance: "owner", price_tier: "€", price_provenance: "llm" });
  }, 30_000);

  it("raises a Format question only when Reviews disagree with Google's category", async () => {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const lookup = (googlePlaceId: string) => POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId, listings: [] }),
    }));
    try {
      fakeRestaurantFacts.googleCategoryDisagrees = true;
      const mismatch = await lookup("invented-format-mismatch-place");
      expect(mismatch.status).toBe(202);
      const mismatchBody = await mismatch.json() as { restaurantSlug: string };
      const { loadRestaurantBundle } = await import("@/web/data");
      expect((await loadRestaurantBundle(mismatchBody.restaurantSlug))?.ownerQuestions).toMatchObject([{
        kind: "format", source: "google", proposedFormat: "tasca", googleCategory: "Tasca restaurant",
      }]);

      fakeRestaurantFacts.googleCategoryDisagrees = false;
      const agrees = await lookup("invented-format-agrees-place");
      expect(agrees.status).toBe(202);
      const agreesBody = await agrees.json() as { restaurantSlug: string };
      expect((await loadRestaurantBundle(agreesBody.restaurantSlug))?.ownerQuestions).toEqual([]);
    } finally {
      fakeRestaurantFacts.googleCategoryDisagrees = false;
    }
  }, 30_000);

  it("changes Format and Price tier, then re-judges without fetching again", async () => {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const { PATCH } = await import("@/app/api/v1/restaurants/[slug]/route");
    const started = await POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-format-correction-place", listings: [] }),
    }));
    const { restaurantSlug } = await started.json() as { restaurantSlug: string };
    const [before] = await sql!`select id, format_changed_at from restaurant where slug = ${restaurantSlug}`;
    const [reviewsBefore] = await sql!`select count(*)::int as count from review rv join listing l on l.id = rv.listing_id where l.restaurant_id = ${before!.id}`;

    fakeVendorCalls.reviewPosts = 0;
    const response = await PATCH(new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "fine_dining", priceTier: "€€€" }),
    }), { params: Promise.resolve({ slug: restaurantSlug }) });
    expect(response.status).toBe(202);
    const { id: jobId } = (await response.json()) as { id: number };
    const [updated] = await sql!`select format, format_provenance, price_tier, price_provenance, format_changed_at from restaurant where id = ${before!.id}`;
    expect(updated).toMatchObject({ format: "fine_dining", format_provenance: "owner", price_tier: "€€€", price_provenance: "owner" });
    expect(updated!.format_changed_at).toEqual(before!.format_changed_at);

    const { runRejudge } = await import("./lookup");
    await runRejudge(Number(before!.id), async () => {}, { jobId, cause: "owner_answer" });
    const [verdictCount] = await sql!`select count(*)::int as count from verdict where restaurant_id = ${before!.id}`;
    expect(verdictCount!.count).toBeGreaterThan(1);
    const [reviewsAfter] = await sql!`select count(*)::int as count from review rv join listing l on l.id = rv.listing_id where l.restaurant_id = ${before!.id}`;
    expect(reviewsAfter!.count).toBe(reviewsBefore!.count);
    const [latestVerdict] = await sql!`select blocks from verdict where restaurant_id = ${before!.id} order by id desc limit 1`;
    expect((latestVerdict!.blocks as { rollup: { changePointAt: string | null } }).rollup.changePointAt).toBeNull();
    expect(fakeVendorCalls.reviewPosts).toBe(0);
  }, 30_000);

  it("declares a Change point that cuts the window, then deleting restores it", async () => {
    const database = sql!;
    const { POST: declare } = await import("@/app/api/v1/restaurants/[slug]/change-points/route");
    const { DELETE: undeclare } = await import("@/app/api/v1/restaurants/[slug]/change-points/[id]/route");
    const { runLookup, runRejudge } = await import("./lookup");

    await database`insert into source (code, name, kind, access) values ('google', 'Google', 'crowd', 'personal_only'), ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only') on conflict (code) do nothing`;
    const restaurantSlug = "fictional-change-point-full";
    const [restaurant] = await database`
      insert into restaurant (slug, name, city, format, format_provenance)
      values (${restaurantSlug}, ${fixture.restaurant}, 'Lisbon', 'tasca', 'owner') returning id`;
    await database`
      insert into listing (restaurant_id, source_code, place_ref, url, match_provenance)
      values (${restaurant!.id}, 'google', 'invented-change-point-google-place', 'https://example.invalid/google', 'pasted'),
             (${restaurant!.id}, 'tripadvisor', 'invented-change-point-tripadvisor-path', 'https://example.invalid/tripadvisor', 'pasted')`;
    await runLookup(Number(restaurant!.id), async () => {});

    const [initialVerdict] = await database`select state from verdict where restaurant_id = ${restaurant!.id} order by id desc limit 1`;
    expect(initialVerdict!.state).toBe("verdict");

    const changePointDate = new Date().toISOString().slice(0, 10);
    const declared = await declare(new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/change-points`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "new_chef", date: changePointDate }),
    }), { params: Promise.resolve({ slug: restaurantSlug }) });
    expect(declared.status).toBe(202);
    const { id: declareJobId } = await declared.json() as { id: number };
    await runRejudge(Number(restaurant!.id), async () => {}, { jobId: declareJobId, cause: "owner_answer" });

    const [changePoint] = await sql!`select id from change_point where restaurant_id = ${restaurant!.id} and date = ${changePointDate}`;
    const [cutVerdict] = await sql!`select state, change_point_id, blocks from verdict where restaurant_id = ${restaurant!.id} order by id desc limit 1`;
    expect(cutVerdict!.state).toBe("not_enough_evidence");
    expect(Number(cutVerdict!.change_point_id)).toBe(Number(changePoint!.id));
    expect((cutVerdict!.blocks as { rollup: { changePointAt: string | null } }).rollup.changePointAt).not.toBeNull();

    // Only the newest Change point matters (ADR 0007): an older one declared afterwards must not
    // take over from the newer one already governing the Verdict.
    const olderDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const declaredOlder = await declare(new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/change-points`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "new_owner", date: olderDate }),
    }), { params: Promise.resolve({ slug: restaurantSlug }) });
    expect(declaredOlder.status).toBe(202);
    const { id: olderJobId } = await declaredOlder.json() as { id: number };
    await runRejudge(Number(restaurant!.id), async () => {}, { jobId: olderJobId, cause: "owner_answer" });

    const [olderChangePoint] = await sql!`select id from change_point where restaurant_id = ${restaurant!.id} and date = ${olderDate}`;
    const [verdictAfterOlder] = await sql!`select change_point_id from verdict where restaurant_id = ${restaurant!.id} order by id desc limit 1`;
    expect(Number(verdictAfterOlder!.change_point_id)).toBe(Number(changePoint!.id));

    // Deleting the older, non-governing Change point changes nothing.
    const deletedOlder = await undeclare(new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/change-points/${olderChangePoint!.id}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ slug: restaurantSlug, id: String(olderChangePoint!.id) }) });
    expect(deletedOlder.status).toBe(202);
    const { id: deleteOlderJobId } = await deletedOlder.json() as { id: number };
    await runRejudge(Number(restaurant!.id), async () => {}, { jobId: deleteOlderJobId, cause: "owner_answer" });
    const [verdictAfterDeletingOlder] = await sql!`select state, change_point_id from verdict where restaurant_id = ${restaurant!.id} order by id desc limit 1`;
    expect(verdictAfterDeletingOlder!.state).toBe("not_enough_evidence");
    expect(Number(verdictAfterDeletingOlder!.change_point_id)).toBe(Number(changePoint!.id));

    const deleted = await undeclare(new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/change-points/${changePoint!.id}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ slug: restaurantSlug, id: String(changePoint!.id) }) });
    expect(deleted.status).toBe(202);
    const { id: deleteJobId } = await deleted.json() as { id: number };
    await runRejudge(Number(restaurant!.id), async () => {}, { jobId: deleteJobId, cause: "owner_answer" });

    const [restoredVerdict] = await sql!`select state, change_point_id, blocks from verdict where restaurant_id = ${restaurant!.id} order by id desc limit 1`;
    expect(restoredVerdict!.state).toBe("verdict");
    expect(restoredVerdict!.change_point_id).toBeNull();
    expect((restoredVerdict!.blocks as { rollup: { changePointAt: string | null } }).rollup.changePointAt).toBeNull();
  }, 45_000);

  it("dismisses a Format question while preserving and pinning its proposed Format", async () => {
    fakeRestaurantFacts.googleCategoryDisagrees = true;
    try {
      const { POST: startLookup } = await import("@/app/api/v1/lookups/route");
      const { POST: dismiss } = await import("@/app/api/v1/owner-questions/[id]/dismiss/route");
      const started = await startLookup(new Request("http://localhost/api/v1/lookups", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ googlePlaceId: "invented-format-dismiss-place", listings: [] }),
      }));
      const { restaurantSlug } = await started.json() as { restaurantSlug: string };
      const { loadRestaurantBundle } = await import("@/web/data");
      const question = (await loadRestaurantBundle(restaurantSlug))?.ownerQuestions[0];
      expect(question?.kind).toBe("format");
      const [before] = await sql!`select id from restaurant where slug = ${restaurantSlug}`;
      // A later reading may change the current proposal while this question remains open.
      await sql!`update restaurant set format = 'fine_dining', format_provenance = 'llm' where id = ${before!.id}`;

      const response = await dismiss(new Request(`http://localhost/api/v1/owner-questions/${question!.id}/dismiss`, { method: "POST" }), {
        params: Promise.resolve({ id: String(question!.id) }),
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ settled: true });
      const [after] = await sql!`select format, format_provenance from restaurant where id = ${before!.id}`;
      expect(after).toMatchObject({ format: "tasca", format_provenance: "owner" });
      const [settled] = await sql!`select status from owner_question where id = ${question!.id}`;
      expect(settled).toMatchObject({ status: "dismissed" });

      const again = await dismiss(new Request(`http://localhost/api/v1/owner-questions/${question!.id}/dismiss`, { method: "POST" }), {
        params: Promise.resolve({ id: String(question!.id) }),
      });
      expect(again.status).toBe(409);
      expect((await again.json()).code).toBe("already_settled");
    } finally {
      fakeRestaurantFacts.googleCategoryDisagrees = false;
    }
  }, 30_000);

  it("raises an Owner question for an uncertain match; Accept fetches the Listing and re-judges", async () => {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const { PUT } = await import("@/app/api/v1/restaurants/[slug]/listings/[source]/route");
    const { routes } = await import("@/lib/api-contract");
    const started = await POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-owner-question-place", listings: [{
        source: "tripadvisor", url: "https://www.tripadvisor.com/invented-owner-question-path",
        placeRef: "invented-owner-question-path", name: fixture.restaurant,
        confidence: "uncertain", autoAccept: false, reviewCount: 8,
        evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: 0.9 },
      }, {
        source: "tripadvisor", url: "https://www.tripadvisor.com/invented-owner-question-path-2",
        placeRef: "invented-owner-question-path-2", name: `${fixture.restaurant} Lisboa`,
        confidence: "uncertain", autoAccept: false, reviewCount: 5,
        evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: 0.8 },
      }] }),
    }));
    expect(started.status).toBe(202);
    const { restaurantSlug } = await started.json() as { restaurantSlug: string };
    const [restaurant] = await sql!`select id from restaurant where slug = ${restaurantSlug}`;

    const [question] = await sql!`select id, status, source_code from owner_question where restaurant_id = ${restaurant!.id}`;
    expect(question).toMatchObject({ status: "open", source_code: "tripadvisor" });

    const { loadRestaurantBundle } = await import("@/web/data");
    const before = await loadRestaurantBundle(restaurantSlug);
    expect(before!.ownerQuestions).toMatchObject([{
      id: Number(question!.id), source: "tripadvisor", prompt: expect.stringContaining("Tripadvisor"),
      candidates: [
        { placeRef: "invented-owner-question-path", name: fixture.restaurant, evidence: { nameSimilarity: 0.9 } },
        { placeRef: "invented-owner-question-path-2", name: `${fixture.restaurant} Lisboa`, evidence: { nameSimilarity: 0.8 } },
      ],
    }]);
    const verdictsBefore = await sql!`select count(*)::int as n from verdict where restaurant_id = ${restaurant!.id}`;
    expect(verdictsBefore[0]!.n).toBe(1);

    const [activeLookup] = await sql!`
      insert into job (kind, restaurant_id, status, step)
      values ('lookup', ${restaurant!.id}, 'running', 'Fetching Reviews') returning id`;
    expect((await loadRestaurantBundle(restaurantSlug))!.ownerQuestions).toEqual([]);
    const prematureAnswer = await PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "accept", placeRef: "invented-owner-question-path-2" }),
      }),
      { params: Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" }) },
    );
    expect(prematureAnswer.status).toBe(409);
    expect((await prematureAnswer.json()).code).toBe("lookup_in_progress");
    await sql!`update job set status = 'succeeded', finished_at = now() where id = ${activeLookup!.id}`;
    expect((await loadRestaurantBundle(restaurantSlug))!.ownerQuestions).toHaveLength(1);

    const invalidChoice = await PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "accept", placeRef: "not-a-proposed-place" }),
      }),
      { params: Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" }) },
    );
    expect(invalidChoice.status).toBe(400);
    const [stillOpen] = await sql!`select status from owner_question where id = ${question!.id}`;
    expect(stillOpen!.status).toBe("open");

    const accept = await PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "accept", placeRef: "invented-owner-question-path-2" }),
      }),
      { params: Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" }) },
    );
    expect(accept.status).toBe(202);
    const accepted = routes.answerListing.responses[202].parse(await accept.json());
    expect(accepted).toMatchObject({ id: expect.any(Number) });

    const [listing] = await sql!`
      select place_ref, match_provenance from listing where restaurant_id = ${restaurant!.id} and source_code = 'tripadvisor'`;
    expect(listing).toMatchObject({ place_ref: "invented-owner-question-path-2", match_provenance: "proposed_confirmed" });
    const [settled] = await sql!`select status, settled_at from owner_question where id = ${question!.id}`;
    expect(settled).toMatchObject({ status: "answered" });
    expect(settled!.settled_at).not.toBeNull();
    const verdictsAfter = await sql!`select count(*)::int as n from verdict where restaurant_id = ${restaurant!.id}`;
    expect(verdictsAfter[0]!.n).toBe(2);
    const reviewCount = await sql!`select count(*)::int as n from review r join listing l on l.id = r.listing_id where l.restaurant_id = ${restaurant!.id}`;
    expect(reviewCount[0]!.n).toBe(16);

    const after = await loadRestaurantBundle(restaurantSlug);
    expect(after!.ownerQuestions).toEqual([]);

    const again = await PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "accept", placeRef: "invented-owner-question-path-2" }),
      }),
      { params: Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" }) },
    );
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("already_settled");
  }, 30_000);

  it("settles a None answer without fetching a Listing", async () => {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const { PUT } = await import("@/app/api/v1/restaurants/[slug]/listings/[source]/route");
    const started = await POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-owner-none-place", listings: [{
        source: "tripadvisor", url: "https://www.tripadvisor.com/invented-owner-none-path",
        placeRef: "invented-owner-none-path", name: fixture.restaurant,
        confidence: "uncertain", autoAccept: false, reviewCount: 8,
        evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: 0.9 },
      }] }),
    }));
    expect(started.status).toBe(202);
    const { restaurantSlug } = await started.json() as { restaurantSlug: string };
    const [restaurant] = await sql!`select id from restaurant where slug = ${restaurantSlug}`;

    const none = await PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "none" }),
      }),
      { params: Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" }) },
    );
    expect(none.status).toBe(202);
    expect(await none.json()).toEqual({ settled: true });
    const [listing] = await sql!`select 1 from listing where restaurant_id = ${restaurant!.id} and source_code = 'tripadvisor'`;
    expect(listing).toBeUndefined();
    const [question] = await sql!`select status from owner_question where restaurant_id = ${restaurant!.id}`;
    expect(question).toMatchObject({ status: "dismissed" });

    const again = await PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "none" }),
      }),
      { params: Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" }) },
    );
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("already_settled");
  }, 30_000);

  it("allows only one concurrent answer to settle an Owner question", async () => {
    const { POST } = await import("@/app/api/v1/lookups/route");
    const { PUT } = await import("@/app/api/v1/restaurants/[slug]/listings/[source]/route");
    const started = await POST(new Request("http://localhost/api/v1/lookups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ googlePlaceId: "invented-owner-race-place", listings: [{
        source: "tripadvisor", url: "https://www.tripadvisor.com/invented-owner-race-path",
        placeRef: "invented-owner-race-path", name: fixture.restaurant,
        confidence: "uncertain", autoAccept: false, reviewCount: 8,
        evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: 0.9 },
      }] }),
    }));
    expect(started.status).toBe(202);
    const { restaurantSlug } = await started.json() as { restaurantSlug: string };
    const params = Promise.resolve({ slug: restaurantSlug, source: "tripadvisor" });
    const answer = () => PUT(
      new Request(`http://localhost/api/v1/restaurants/${restaurantSlug}/listings/tripadvisor`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "none" }),
      }),
      { params },
    );

    const responses = await Promise.all([answer(), answer()]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([202, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect((await conflict.json()).code).toBe("already_settled");
  }, 30_000);
});
