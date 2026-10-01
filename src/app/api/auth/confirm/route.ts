import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { admitSignedIn } from "@/lib/auth-admission";
import { isCrossSite, redirectWithCookies, safeNext } from "@/lib/auth-flow";

// Public: the "Continue" button on /auth/confirm. The email link only opens that page (a mail scanner
// fetching it uses up nothing); this POST is what spends the one-time token and starts the session.
export async function POST(request: Request) {
  if (isCrossSite(request)) return new Response("Cross-site request refused", { status: 403 });
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const code = String(form.get("code") ?? "");
  const formInvite = String(form.get("invite") ?? "") || null;
  const next = safeNext(String(form.get("next") ?? "/"));
  const cookies: CookieToSet[] = [];
  const go = (path: string) => redirectWithCookies(request, path, cookies);

  if (!tokenHash && !code) return go("/sign-in?error=link_expired");
  const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
  // token_hash comes from the custom email template; code from Supabase's default link (same browser only).
  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
    : await supabase.auth.exchangeCodeForSession(code);
  const user = data.user;
  if (error || !user) {
    console.error(`auth confirm failed: ${error?.message ?? "no user"}`);
    return go("/sign-in?error=link_expired");
  }
  // The Invite link rides in the metadata set when the account was created for it (works on any device).
  const meta = user.user_metadata?.invite;
  const invite = formInvite ?? (typeof meta === "string" ? meta : null);
  return go(await admitSignedIn(supabase, user, invite, next));
}
