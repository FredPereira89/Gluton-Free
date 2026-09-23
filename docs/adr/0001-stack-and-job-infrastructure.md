---
status: accepted
---

# All-TypeScript: Next.js on Vercel, Supabase, Trigger.dev for every long job

Gluton-Free ingests Reviews on demand, fans out per Source, waits minutes on third-party scrapes, and runs LLM extraction in batches, all on a total budget of about EUR 25/month that also has to cover LLM and data costs. We chose TypeScript end to end: Next.js on Vercel Hobby for the web app and a REST `/api/v1` described by OpenAPI generated from zod, Supabase Free for Postgres, Auth and Storage, and Trigger.dev Cloud for all ingestion, analysis, Verdict recomputation, the Lisbon baseline and scheduled refresh. Infrastructure then costs roughly EUR 0–10/month, and long jobs escape Vercel Hobby's 300 s and Supabase Edge's 150 s limits. The stack choice was delegated to the agent (see [Stack and background-job infrastructure](https://github.com/FredPereira89/Gluton-Free/issues/5)).

## Consequences

- Long work never runs in Vercel functions, Vercel Cron or Supabase Edge Functions, even when it looks short enough.
- Long operations return `202` plus a pollable job resource. Mobile clients authenticate with a Supabase JWT sent as a bearer token.
- No reviewer identity field exists in any DB or API schema.
- Accepted risks, each with a trigger to revisit:
  - Supabase Free pauses after about 7 days of low activity. Mitigated by a scheduled heartbeat.
  - The 500 MB database cap rules out full-size per-Review embeddings and storing raw vendor payloads long-term.
  - Vercel Hobby is non-commercial only. A public launch with ads or affiliate links would need Vercel Pro.
- Revisit when the database passes ~400 MB, Trigger.dev costs pass $10/month, or an analysis step genuinely needs Python ML. Trigger.dev's Python extension is the escape hatch for that last case.

## Considered Options

- **Inngest:** compute would still run inside Vercel's 300 s limit, and the next tier is $99/month.
- **Supabase Queues + pg_cron + Edge Functions:** limited to 150 s wall time and 2 s CPU, with retries built by hand.
- **Cloudflare Workers + D1:** SQLite without pgvector, and auth built by hand.
- **Python worker on Railway or Fly:** extra cost and a second language, with no need for either.
- **tRPC and GraphQL for the API:** tRPC only serves TypeScript clients. GraphQL adds overhead without a benefit here.
