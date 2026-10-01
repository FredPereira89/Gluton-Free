import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { admitSignedIn } from "@/lib/auth-admission";
import { redirectWithCookies, safeNext } from "@/lib/auth-flow";

// Public: where a PKCE magic link lands (the email links now go through /auth/confirm instead, which
// survives mail scanners). Exchanges the code for a session, then lets in only the Owner or an Invitee.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const cookies: CookieToSet[] = [];
  const go = (path: string) => redirectWithCookies(request, path, cookies);

  if (!code) return go("/sign-in?error=link_expired");
  const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data.user;
  if (error || !user) {
    console.error(`auth callback code exchange failed: ${error?.message ?? "no user"}`);
    return go("/sign-in?error=link_expired");
  }
  return go(await admitSignedIn(supabase, user, url.searchParams.get("invite"), safeNext(url.searchParams.get("next") ?? "/")));
}
