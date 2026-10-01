import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { admitSignedIn } from "@/lib/auth-admission";
import { isCrossSite, redirectWithCookies, safeNext } from "@/lib/auth-flow";

// Public: the "Continue" button on /auth/confirm. The email link only opens that page (a mail scanner
// fetching it uses up nothing); this POST is what spends the one-time token and starts the session.
export async function POST(request: Request) {
  if (isCrossSite(request)) return new Response("Cross-site request refused", { status: 403 });
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const invite = String(form.get("invite") ?? "") || null;
  const next = safeNext(String(form.get("next") ?? "/"));
  const cookies: CookieToSet[] = [];
  const go = (path: string) => redirectWithCookies(request, path, cookies);

  if (!tokenHash) return go("/sign-in?error=link_expired");
  const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  const user = data.user;
  if (error || !user) {
    console.error(`auth confirm failed: ${error?.message ?? "no user"}`);
    return go("/sign-in?error=link_expired");
  }
  return go(await admitSignedIn(supabase, user, invite, next));
}
