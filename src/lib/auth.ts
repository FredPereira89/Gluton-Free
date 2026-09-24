import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";

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

function requireOwnerSub(sub: string | undefined): string {
  const ownerId = env("OWNER_USER_ID");
  if (!sub) throw new AuthError(401, "unauthenticated", "Token has no subject claim");
  if (sub !== ownerId) throw new AuthError(403, "forbidden", "Token subject is not the owner");
  return sub;
}

async function verifyBearer(token: string, fetchImpl: typeof fetch | undefined): Promise<string> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: fetchImpl ? { fetch: fetchImpl } : undefined,
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data) throw new AuthError(401, "unauthenticated", error?.message ?? "Invalid bearer token");
  return requireOwnerSub(data.claims.sub);
}

async function verifyCookieSession(
  request: Request,
  fetchImpl: typeof fetch | undefined,
  onSetCookies: ((cookies: CookieToSet[]) => void) | undefined,
): Promise<string> {
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
  return requireOwnerSub(data.claims.sub);
}

/**
 * The single canonical owner-authorization check, reused by middleware for every
 * protected page and API route. Bearer tokens (mobile clients) win over cookies
 * (the web session); either way the resolved JWT subject must equal OWNER_USER_ID.
 */
export async function requireOwner(request: Request, options: RequireOwnerOptions = {}): Promise<string> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    // Bearer-token requests (mobile clients) are exempt from the Origin/CSRF check:
    // browsers never attach an app's bearer token automatically the way they do cookies.
    return verifyBearer(authorization.slice(7), options.fetch);
  }
  checkCsrf(request);
  return verifyCookieSession(request, options.fetch, options.onSetCookies);
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
