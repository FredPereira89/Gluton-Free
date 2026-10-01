// Helpers shared by the sign-in, invite and magic-link callback routes.
import { NextResponse } from "next/server";
import type { CookieToSet } from "./auth";

/** Only a same-site relative path, so `next` can't be used for an open redirect. */
export function safeNext(next: string): string {
  // URL parsing drops tabs and newlines, so a path like "/<TAB>/evil.example" would read as "//evil.example".
  if (/[\x00-\x1f\x7f]/.test(next) || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  const base = "https://site.invalid";
  const url = new URL(next, base);
  return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/";
}

/** A browser form post from another site: the public auth routes refuse it (a missing Origin is let through). */
export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

/** A 303 to a path on this site, carrying any auth cookies the flow set (PKCE verifier, session). */
export function redirectWithCookies(request: Request, path: string, cookies: CookieToSet[]): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), { status: 303 });
  for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
  return response;
}
