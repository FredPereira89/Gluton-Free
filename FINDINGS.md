# Research: Stack and background-job infrastructure (#5)

Researched 2026-09-23 against live vendor docs and pricing pages (links inline). All prices USD unless noted; EUR ~ USD at this budget's precision. Glossary terms follow `CONTEXT.md`.

## Answer (TL;DR)

- **Stack:** all-TypeScript. **Next.js (App Router) on Vercel Hobby** for the responsive web app and a versioned **REST `/api/v1`**; **Supabase Free** for Postgres (+ `pg_trgm`, `pgvector` if needed), Auth and Storage.
- **Job runner:** **Trigger.dev Cloud (Free, move to Hobby at $10/mo if needed)** runs ingestion + LLM analysis as durable tasks with no run timeout, retries, idempotency keys, fan-out (`batchTriggerAndWait`), cron schedules, and waitpoint tokens for vendor webhooks. Do not put long jobs in Vercel functions or Supabase Edge Functions.
- **No Python.** Aspect extraction is an LLM call, peer percentiles are SQL, entity matching is `pg_trgm` + LLM tie-break. Trigger.dev's Python extension is the escape hatch if an ML library is ever needed.
- **API:** REST + JSON + OpenAPI 3.1 generated from zod schemas, Supabase Auth JWT as a bearer token, `202 Accepted` + job resource for on-demand refresh. Not tRPC, not GraphQL.
- **Cost:** infrastructure **~$0/month** on free tiers (optional domain ~EUR 1/mo). Job compute fits inside Trigger.dev's $5 free credit. The rest of the EUR 25 goes to LLM (#4) and data vendors (#3). The one fixed cost to plan for is Trigger.dev Hobby at $10 if the free tier's 1-day log retention or 10 schedules get in the way. Supabase Pro ($25) is out of budget, so the Free-tier pause and 500 MB caps are the main infrastructure risks.

## Requirements recap (from #1 / #5)

- On-demand ingestion (user looks up a Restaurant), scheduled refresh of looked-up Restaurants, and a one-off Lisbon baseline of a few hundred Restaurants.
- Jobs take tens of seconds to minutes. They fan out per Source, call vendor APIs whose scrapes may themselves take minutes, then call an LLM per batch of Reviews and recompute Verdicts against same-Format peers.
- Web-first and responsive; the API must be usable by a later Expo/React Native client.
- Managed services; ~EUR 25/month total including LLM and data; personal but public-compatible; no reviewer PII.

## 1. Hosting / app platform

### Vercel (Hobby, $0)
- Hobby is "$0/mo", "for personal, non-commercial use", and includes 4 h Active CPU, 1M function invocations and 100 GB Fast Data Transfer per month. Pro is $20/mo. ([vercel.com/pricing](https://vercel.com/pricing))
- Commercial use (payments, ads, affiliate-primary, paid dev work) needs Pro; **donations are not commercial**. A personal, non-monetised public app fits Hobby. ([Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines), updated 2026-09-14)
- Function limits with Fluid compute: **Hobby 300 s default and maximum duration**, 2 GB / 1 vCPU; Pro up to 800 s (1800 s beta). Runs in one region by default (`iad1`), which can be changed. 4.5 MB request/response body cap. ([Functions limits](https://vercel.com/docs/functions/limitations), updated 2026-08-24)
- Active CPU excludes I/O wait ("calling AI models, database queries"), so LLM-heavy handlers use little CPU budget. (same page)
- **Cron on Hobby: once per day minimum, ±59 min precision**; more frequent expressions fail to deploy. ([Cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), updated 2026-07-15). So Vercel Cron is not usable as the refresh scheduler.
- Vercel Workflows (durable): Hobby includes 50,000 events and 1 GB data written per month. Each step produces about 3 events, and step runtime is still bounded by the function limit (300 s on Hobby). Hobby managed-state retention is 1 day. ([Workflows pricing](https://vercel.com/docs/workflows/pricing), updated 2026-09-16)

### Cloudflare Workers (alternative)
- Free: 100k requests/day, **10 ms CPU per invocation**. Paid ($5): 10M requests + 30M CPU-ms/month, max 5 min CPU per invocation. Queues Free is 10k operations/day; D1 Free is 5M rows read / 100k rows written per day. ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/))
- Workflows Free: 10 ms CPU per step, 1,024 steps, 3-day retention. Paid: 30 s to 5 min CPU per step, unlimited wall time. ([Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/))
- Workable only on the $5 paid plan. D1 is SQLite (no pgvector, no Postgres extensions), auth is DIY, and Next.js needs the OpenNext adapter. More assembly for no gain here.

### Railway / Fly with a Python worker (alternative)
- Railway Hobby is $5/mo including $5 usage; ~$20 per vCPU-month and ~$10 per GB-RAM-month. ([railway.com/pricing](https://railway.com/pricing)) An always-on 0.5 GB worker costs roughly $5–10/mo. It also means running a server and building your own queue, retries and observability. It is only justified if Python becomes necessary (section 4 says it doesn't).

**Pick: Vercel Hobby.** Set the default function region to an EU region close to the Supabase project, since Lisbon is the launch city.

## 2. Database / auth / storage

### Supabase (Free, $0)
- Free: 500 MB database (shared CPU, 500 MB RAM), 5 GB egress, 50,000 MAU, 1 GB file storage, 500k Edge Function invocations, 2 active projects, **"paused after 1 week of inactivity"**. Pro: from $25/mo, 8 GB disk, $10 compute credit, never paused. ([supabase.com/pricing](https://supabase.com/pricing))
- The pause rule reads "We may pause applications on the Free Plan that exhibit low activity in a 7-day period". **Activity is not defined.** Paused projects can be restored from the dashboard. ([Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod))
- Pro spend cap covers usage items (disk, egress, MAU, functions, storage…) but not compute. ([Cost control](https://supabase.com/docs/guides/platform/cost-control))
- pgvector with HNSW/IVFFlat indexes is supported. ([pgvector guide](https://supabase.com/docs/guides/database/extensions/pgvector))
- Supabase Cron = `pg_cron`. It can run SQL or make HTTP requests (e.g. invoke Edge Functions), schedule from every second to yearly, and Supabase recommends ≤8 concurrent jobs of ≤10 min each. ([Supabase Cron](https://supabase.com/docs/guides/cron))
- Supabase Queues = `pgmq`, "Postgres-native durable Message Queue… guaranteed delivery", with visibility windows and archival. ([Queues](https://supabase.com/docs/guides/queues)) Plan availability isn't stated on the pricing page. It is a Postgres extension, so it should run on Free, but this is not verified.
- Edge Functions: **150 s wall clock on Free** (400 s paid), **2 s CPU per request**, 256 MB memory; `waitUntil` background work only within the wall-clock window. ([Edge Function limits](https://supabase.com/docs/guides/functions/limits))

### Neon (alternative)
- Free: 0.5 GB per project, 100 CU-hours per project, scale to zero after 5 min, 100 projects. Launch plan is pay as you go at $0.35/GB-month and $0.106/CU-hour. ([neon.com/pricing](https://neon.com/pricing)) Same storage cap as Supabase, but no bundled auth or storage. It doesn't pause the project, though; compute only scales to zero.

**Pick: Supabase Free.** You get Postgres, Auth (with Expo-ready `supabase-js`), Storage (user-assisted captures) and Realtime from one managed service. Use the local Supabase CLI for dev so the second free project stays spare.

**Storage budget warning (affects the data-model ticket):** 500 MB is enough for review text and aspect JSON (~100k Reviews × ~1.5 KB ≈ 150 MB plus indexes). It is **not** enough for per-Review 1536-dim float embeddings (~6 KB each → ~600 MB per 100k). Either skip per-Review embeddings in the MVP or use reduced dimensions / `halfvec`. Don't store raw vendor payloads long-term in Postgres; this also matters for Source ToS retention.

## 3. Background jobs

| Option | Free tier | Duration limit | Scheduling | Fan-out / retries | Verdict |
|---|---|---|---|---|---|
| **Trigger.dev Cloud** | Free $0 with $5/mo credit; Hobby $10 with $10 credit | **No run timeout** (TTL 14 days) | 10 schedules (Free), 100 (Hobby) | `batchTriggerAndWait` (≤1,000 items), retries with backoff, idempotency keys, waitpoint tokens | **Chosen** |
| Inngest | 50k executions/mo, 5 concurrent steps, 24 h traces; next tier **$99/mo** | Steps run on *your* host, so bounded by Vercel Hobby's 300 s | cron supported | step fan-out, retries | Runner-up; $99 cliff and Vercel-bound compute |
| Vercel Workflows | 50k events/mo on Hobby | Step bounded by Vercel function limit (300 s Hobby) | "No limit" schedules | durable steps, retries | Viable but newer; 1-day retention on Hobby; no Python path |
| Supabase Queues + pg_cron + Edge Functions | included | **150 s wall, 2 s CPU** per Edge invocation (Free) | pg_cron, down to seconds | DIY retries, DIY observability | Too much DIY; CPU cap is tight |
| Vercel Cron | included | 300 s | **once/day, ±59 min** on Hobby | none | Unusable for refresh |
| Cloudflare Queues/Workflows | Queues 10k ops/day; Workflows 10 ms CPU/step (Free) | 5 min CPU per step on Paid | Cron Triggers | durable steps | Needs $5 plan and Cloudflare stack |

Sources: [Trigger.dev pricing](https://trigger.dev/pricing), [Trigger.dev limits](https://trigger.dev/docs/limits), [Inngest pricing](https://www.inngest.com/pricing), [Vercel Workflows pricing](https://vercel.com/docs/workflows/pricing), [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits), [Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/).

### Trigger.dev details
- Pricing page: Free has "$5 / month free credits", unlimited max run duration, 10 schedules, 1-day log retention, 10 concurrent Realtime connections. Hobby is $10/mo with $10 credit, 100 schedules, 7-day logs, 150 Realtime connections. Per-run cost is $0.000025. On Free, "you'll need to upgrade to keep running tasks once the included $5 of credits is used". Billing alerts at 75/90/100/200/500% plus spike alerts. ([trigger.dev/pricing](https://trigger.dev/pricing))
- Compute per second: micro (0.25 vCPU/0.25 GB) $0.0000169; **small-1x (default, 0.5/0.5) $0.0000338**; small-2x $0.0000675; medium-1x $0.000085. ([pricing](https://trigger.dev/pricing), [machines](https://trigger.dev/docs/machines))
- **Concurrency discrepancy:** the pricing page says Free 20 / Hobby 50 concurrent runs, but the limits doc says Free 10 / Hobby 25. Plan for the lower figure. Other documented limits: 3 MB payload, 10 MB output, batch ≤1,000 items, API 1,500 req/min, Free batch bucket 1,200 runs refilling 100 per 10 s. ([limits](https://trigger.dev/docs/limits))
- Code runs on Trigger.dev's managed workers, not on Vercel. Checkpoint-resume means "we don't charge for the time waiting for subtasks or the time spent in a paused state". ([How it works](https://trigger.dev/docs/how-it-works))
- Waitpoint tokens: `wait.createToken()` / `wait.forToken()`. The token's `url` can be POSTed by an external service (server-to-server, no CORS), with a default 10-minute timeout and idempotency keys. This fits scraping vendors that call a webhook when a crawl finishes: the task sleeps unbilled instead of polling. ([Wait for token](https://trigger.dev/docs/wait-for-token))
- Realtime: `useRealtimeRun` React hooks subscribe to run status and metadata, authenticated by public access tokens. ([Realtime](https://trigger.dev/docs/realtime/overview)) Because Free caps this at 10 concurrent connections, expose job status through our own API (poll `GET /api/v1/jobs/{id}`, optionally Supabase Realtime on a `jobs` row) so mobile doesn't depend on Trigger.dev's SDK.
- Python extension: `@trigger.dev/python` runs inline or file scripts with a `requirements.txt` (production builds). ([Python extension](https://trigger.dev/docs/config/extensions/pythonExtension))

### Compute cost estimate (Trigger.dev)
Most job time is I/O wait on vendor APIs and the LLM. Waits via `triggerAndWait` or waitpoint tokens aren't billed, but an in-process `await fetch(llm)` is, so budget for wall time.
- Per Restaurant refresh: ~120–180 s on small-1x ≈ $0.004–0.006, plus $0.000025 per run.
- One-off Lisbon baseline, 400 Restaurants × 180 s ≈ **$2.40** (half that on micro).
- Scheduled refresh, 200 tracked Restaurants weekly ≈ 870 runs/mo × 150 s ≈ **$4.40/mo** on small-1x, **~$2.20** on micro.
- Fits in the $5 Free credit if refresh is weekly or less often and cheap tasks use `micro`. Otherwise Hobby ($10, $10 credit) covers it with room to spare.

## 4. Python vs all-TypeScript

No analysis step needs Python ML libraries:
- **Aspect extraction / sentiment / red flags:** LLM structured output (TS SDK). Owned by #4.
- **Peer percentiles and Tier thresholds:** `percentile_cont` / `ntile` in Postgres, or a few lines of TS.
- **Entity matching across Sources:** `pg_trgm` similarity on name + PostGIS/haversine distance + address normalisation, with an LLM tie-break for ambiguous pairs. Supabase supports `pg_trgm`/PostGIS as extensions.
- **Near-duplicate / fake Review signals (later):** SQL heuristics plus an optional small-dimension embedding, both reachable from TS.
- **Escape hatch:** Trigger.dev Python extension, without adding a server.

Staying all-TypeScript gives one language, one repo, shared zod schemas between API, jobs and a future Expo client, and one type system for the no-PII DTOs.

## 5. API shape (mobile readiness)

**REST + JSON, OpenAPI 3.1, versioned `/api/v1`**, implemented as Next.js Route Handlers (optionally a Hono app mounted under `app/api/[[...route]]`) with zod schemas that generate the OpenAPI document. A typed client for Expo can be generated from that document.
- Auth: Supabase Auth. The web app uses cookies (SSR), and mobile sends `Authorization: Bearer <supabase access token>`. The API verifies the JWT, so one code path serves both.
- Read endpoints (all Verdicts are universal and public-compatible, so they're cacheable): `GET /restaurants?query=&near=`, `GET /restaurants/{id}`, `GET /restaurants/{id}/verdict` (Tier, confidence, explanation, provisional flag, Evidence). `Cache-Control`/ETag on these.
- Write/async: `POST /restaurants/lookup` (by name+location or Source URL/place ID) and `POST /restaurants/{id}/refresh` return `202 Accepted` with a `job` resource. Clients poll `GET /jobs/{id}`, and the web app can also subscribe via Supabase Realtime.
- Cursor pagination; problem+json errors; idempotency key header on POSTs (passed through to Trigger.dev idempotency keys).
- **No-PII rule enforced at the contract:** response schemas have no reviewer fields at all, and the DB never stores them.
- Don't expose PostgREST/`supabase-js` table access as the public contract. Use RLS as defence in depth, and keep the domain API as the stable surface for mobile.

Rejected: **tRPC** (TS-client-only, no language-neutral contract, awkward caching/versioning for a public-compatible API); **GraphQL** (schema/resolver overhead for a handful of read-mostly resources; HTTP caching harder).

## 6. Monthly cost picture (EUR ≈ USD)

| Item | Steady state / month | Notes |
|---|---|---|
| Vercel Hobby | 0 | personal non-commercial |
| Supabase Free | 0 | 500 MB DB; 7-day pause risk |
| Trigger.dev Free → Hobby | 0 → 10 | $5 credit likely enough; Hobby buys 7-day logs, 100 schedules |
| Domain (optional) | ~1 | |
| LLM (owned by #4) | ~2–6 | Illustrative: Haiku 4.5 is $1/$5 per MTok and Batch API is −50% ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)). At ~20 Reviews per call with a cached system prompt, that's ≈ $0.001/Review standard or ≈ $0.0005 batched. The baseline of ~40k Reviews ≈ $10–20 one-off. |
| Data vendors (owned by #3) | remainder ≈ 8–20 | |
| **Total infra** | **~0–11** | leaves ≥ EUR 14 for LLM + data |

## 7. Risks and mitigations
- **Supabase Free pause (7 days of "low activity", undefined):** scheduled refresh jobs write to the DB daily or weekly, which is probably activity but not guaranteed. Add a daily lightweight Trigger.dev schedule that runs a query. If it pauses anyway, restore from the dashboard. Pro ($25) would take the whole budget, so treat it as the trigger for a re-decision (e.g. Neon plus a separate auth provider).
- **500 MB DB cap:** see the storage warning above. Keep raw vendor payloads out of Postgres or store them briefly in Storage with a TTL.
- **Trigger.dev Free exhaustion:** tasks stop when the $5 credit runs out. Set billing alerts, use `micro` for I/O-bound tasks, and upgrade to Hobby ($10) if refresh frequency grows.
- **Vendor lock-in:** tasks are plain TS functions, so porting to Inngest or Vercel Workflows is a moderate rewrite, not a re-architecture. Trigger.dev is also open source and self-hostable.
- **Hobby "non-commercial" terms:** going public with ads or affiliate links would require Vercel Pro ($20). Donations are fine.

## Draft ADR (for `docs/adr/0001-stack-and-job-infrastructure.md`)

### ADR 0001: Stack and background-job infrastructure

**Status:** Proposed (2026-09-23)

**Context.**
Gluton-Free ingests Reviews for a Restaurant from several Sources on demand, refreshes looked-up Restaurants on a schedule, and runs a one-off Lisbon baseline of a few hundred Restaurants to form same-Format peer distributions. Each ingestion fans out per Source, may wait minutes for third-party scrapes, runs LLM aspect extraction over batches of Reviews, and recomputes the Verdict. The MVP is personal but public-compatible, web-first, and needs an API a future mobile client can use. Managed services are preferred, and the total budget is about EUR 25/month including LLM and data costs, so infrastructure should cost close to nothing. No reviewer may ever be identified.

**Decision.**
1. **Language:** TypeScript end to end. No Python service. Trigger.dev's Python extension is the escape hatch if an ML library is ever required.
2. **Web + API:** Next.js (App Router) on Vercel Hobby, with an EU default function region. The API is REST/JSON under `/api/v1`, described by OpenAPI 3.1 generated from zod schemas, and authenticated with Supabase Auth JWTs (cookies on web, bearer tokens on mobile). Long operations return `202` with a job resource.
3. **Data:** Supabase Free: Postgres (with `pg_trgm` and optional `pgvector`/PostGIS), Auth, Storage, Realtime. Local Supabase CLI for development.
4. **Background jobs:** Trigger.dev Cloud (Free plan, Hobby when needed) for all ingestion, analysis, Verdict recomputation, the Lisbon baseline and scheduled refresh. Jobs use `batchTriggerAndWait` for per-Source fan-out, idempotency keys derived from Source review IDs and Restaurant IDs, retries with backoff, and waitpoint tokens for vendor webhooks. Vercel Cron and Supabase Edge Functions are not used for long work.
5. **Contract-level privacy:** no reviewer identity fields exist in the DB schema or API schemas.

**Consequences.**
- Infrastructure costs ~EUR 0/month, rising to ~EUR 10 on Trigger.dev Hobby. That leaves most of the budget for LLM and data vendors.
- Long jobs escape Vercel's 300 s Hobby limit and Supabase Edge's 150 s / 2 s CPU limits, and vendor waits are unbilled.
- One language, shared zod types across web, API, jobs and a future Expo client, and a language-neutral OpenAPI contract for mobile.
- Accepted risks: Supabase Free pauses after 7 days of low activity (mitigated by a scheduled heartbeat) and the 500 MB DB cap (no full-size per-Review embeddings, no long-term raw payloads). Trigger.dev Free stops at $5 of usage and keeps 1-day logs. Vercel Hobby forbids commercial use, so going public with ads would need Vercel Pro.
- Revisit if the Supabase pause becomes a problem, the DB passes ~400 MB, Trigger.dev costs pass $10/mo, or an analysis step truly needs Python ML.

**Alternatives rejected.**
- Inngest: compute runs on Vercel Hobby (300 s), and the next tier is $99/mo.
- Vercel Workflows: viable, but steps are capped at 300 s on Hobby, retention is 1 day, it's newer, and there's no Python path.
- Supabase Queues + pg_cron + Edge Functions: 150 s wall / 2 s CPU, with DIY retries and observability.
- Vercel Cron: once a day, ±59 min on Hobby.
- Cloudflare Workers/Queues/Workflows + D1: needs the $5 plan, SQLite without pgvector, DIY auth, and a Next.js adapter.
- Railway/Fly Python worker: ~$5–10/mo plus ops for a language we don't need.
- tRPC: TS-only clients.
- GraphQL: overhead without benefit.

## Sources
- https://vercel.com/pricing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/workflows/pricing
- https://vercel.com/docs/limits/fair-use-guidelines
- https://supabase.com/pricing
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/cost-control
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/database/extensions/pgvector
- https://trigger.dev/pricing
- https://trigger.dev/docs/limits
- https://trigger.dev/docs/machines
- https://trigger.dev/docs/how-it-works
- https://trigger.dev/docs/wait-for-token
- https://trigger.dev/docs/realtime/overview
- https://trigger.dev/docs/config/extensions/pythonExtension
- https://www.inngest.com/pricing
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workflows/reference/limits/
- https://neon.com/pricing
- https://railway.com/pricing
- https://platform.claude.com/docs/en/about-claude/pricing
