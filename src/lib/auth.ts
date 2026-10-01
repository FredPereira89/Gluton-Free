import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";
import type { AuthLevel } from "./api-contract";
import { db } from "./db";

// RFC 9457 problem+json codes; kept as a stable enum for API consumers.
export type AuthErrorCode = "unauthenticated" | "forbidden" | "csrf" | "not_configured";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type CookieToSet = { name: string; value: string; options: CookieOptions };

export type RequireOwnerOptions = {
  /** Injected for tests to mock the JWKS/auth endpoints without real network access. */
  fetch?: typeof fetch;
  /** Called with any auth cookies that need to be written back (e.g. after a token refresh). */
  onSetCookies?: (cookies: CookieToSet[]) => void;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new AuthError(503, "not_configured", `${name} is not set`);
  return value;
}

function checkCsrf(request: Request): void {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) throw new AuthError(403, "csrf", "Origin header is missing on a mutating request");
  if (origin !== new URL(request.url).origin) {
    throw new AuthError(403, "csrf", "Origin header does not match the request URL");
  }
}

/** What a route needs of its caller: the Owner alone, or the Owner or any recorded Invitee. */
export type CallerLevel = Exclude<AuthLevel, "none">;
export type Caller = { userId: string; role: CallerLevel };

/**
 * A recorded Invitee who has not been locked out. Each check also stamps last seen, at most once
 * every five minutes, so the Owner can see who is using the beta without a write per request.
 */
export async function isActiveInvitee(userId: string): Promise<boolean> {
  const rows = await db()`
    with active as (select user_id from invitee where user_id = ${userId} and not locked_out),
    seen as (
      update invitee set last_seen_at = now()
      where user_id in (select user_id from active)
        and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
    )
    select 1 from active`;
  return rows.length > 0;
}

/**
 * Resolves a verified token subject to the Owner, an Invitee, or nobody. A locked-out Invitee
 * and a user the Owner never invited are refused identically. The Owner never touches the
 * Invitee table.
 */
async function authorize(sub: string | undefined, level: CallerLevel): Promise<Caller> {
  const ownerId = env("OWNER_USER_ID");
  if (!sub) throw new AuthError(401, "unauthenticated", "Token has no subject claim");
  if (sub === ownerId) return { userId: sub, role: "owner" };
  if (level === "invitee" && (await isActiveInvitee(sub))) return { userId: sub, role: "invitee" };
  throw new AuthError(403, "forbidden", level === "owner" ? "Token subject is not the owner" : "Token subject is not an Invitee or the owner");
}

async function verifyBearer(token: string, fetchImpl: typeof fetch | undefined): Promise<string | undefined> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: fetchImpl ? { fetch: fetchImpl } : undefined,
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data) throw new AuthError(401, "unauthenticated", error?.message ?? "Invalid bearer token");
  return data.claims.sub;
}

async function verifyCookieSession(
  request: Request,
  fetchImpl: typeof fetch | undefined,
  onSetCookies: ((cookies: CookieToSet[]) => void) | undefined,
): Promise<string | undefined> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const supabase: SupabaseClient = createServerClient(url, key, {
    global: fetchImpl ? { fetch: fetchImpl } : undefined,
    cookies: {
      getAll: () => parseCookieHeader(cookieHeader),
      setAll: (cookies) => onSetCookies?.(cookies),
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) throw new AuthError(401, "unauthenticated", error?.message ?? "No session");
  return data.claims.sub;
}

/**
 * The single canonical authorization check, reused by the proxy for every protected page and
 * API route. Bearer tokens (mobile clients) win over cookies (the web session); either way the
 * verified JWT subject must be the Owner (OWNER_USER_ID) or, on an invitee-level route, a
 * recorded Invitee who is not locked out. Anyone else is refused with 403.
 */
export async function requireCaller(request: Request, level: CallerLevel, options: RequireOwnerOptions = {}): Promise<Caller> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    // Bearer-token requests (mobile clients) are exempt from the Origin/CSRF check:
    // browsers never attach an app's bearer token automatically the way they do cookies.
    return authorize(await verifyBearer(authorization.slice(7), options.fetch), level);
  }
  checkCsrf(request);
  return authorize(await verifyCookieSession(request, options.fetch, options.onSetCookies), level);
}

/** The owner-only check: the caller must be OWNER_USER_ID. An Invitee is refused. */
export async function requireOwner(request: Request, options: RequireOwnerOptions = {}): Promise<string> {
  return (await requireCaller(request, "owner", options)).userId;
}

/** A cookie-backed Supabase client for the sign-in/sign-out routes. */
export function createAuthRouteClient(request: Request, onSetCookies: (cookies: CookieToSet[]) => void): SupabaseClient {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const cookieHeader = request.headers.get("cookie") ?? "";
  return createServerClient(url, key, {
    cookies: {
      getAll: () => parseCookieHeader(cookieHeader),
      setAll: onSetCookies,
    },
  });
}
