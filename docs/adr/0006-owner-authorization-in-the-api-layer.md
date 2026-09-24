---
status: accepted
---

# Owner authorization in the API layer, RLS stays deny-all

Gluton-Free is a personal tool with exactly one user, the owner. The web app and a future mobile app both sign in with Supabase Auth, but neither ever reads the database through Supabase's Data API. Every request goes through our own `/api/v1` routes, and each route checks that the caller is the owner (`sub == OWNER_USER_ID`). The server then reads and writes as the database owner through the session pooler. Row Level Security stays switched on with **no policies**, so the Data API exposes nothing even to a signed-in user.

A reader who knows Supabase will expect RLS policies keyed on `auth.uid()`. We don't use them because:

- **One tenant, no rows to separate.** RLS earns its keep by separating users' rows. Here every row belongs to the owner, so a policy would only restate "is the owner", which the API already checks in one place.
- **The heavy writers aren't users.** Trigger.dev tasks (lookups, refreshes, the Lisbon baseline) write as the database owner. That would bypass RLS anyway, so policies would cover only a fraction of the writes.
- **The API is the contract.** Mobile and web share one REST contract, generated from zod into OpenAPI. That contract is where the PII and raw-payload exclusions are enforced. Letting clients query tables directly would be a second, unguarded contract.

Decided in [Mobile-ready API shape and authentication](https://github.com/FredPereira89/Gluton-Free/issues/15).

## Consequences

- Every route in the route registry declares `auth: "owner"`, and a test fails if one doesn't. The only exceptions are the sign-in page and a data-free `/api/v1/health`.
- Supabase is used by clients for Auth only. Access JWTs are verified on the server against the project's JWKS: a bearer token from mobile, httpOnly cookies on the web, where a cookie-authenticated write must also carry a matching `Origin`.
- The `SITE_PASSWORD` basic-auth gate is removed. It uses the same `Authorization` header a bearer token needs, and it behaves badly in an installed iOS web app.
- Going multi-user later means adding a tenant key, and either RLS policies or tenant-scoped queries on every table. That is a rewrite of data access, accepted because multi-user is out of scope.

## Considered Options

- **RLS policies on `auth.uid()`, clients query through the Data API:** idiomatic Supabase, but it duplicates the owner check per table, doesn't cover Trigger.dev's writes, and bypasses the zod contract that keeps reviewer fields out.
- **Keep basic auth plus a static API token for mobile:** simplest, but it has no sessions and no revocation per device, and it's fragile for Web Push in an installed web app.
