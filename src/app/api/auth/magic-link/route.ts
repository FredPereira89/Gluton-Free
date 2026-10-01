import { z } from "zod";
import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { isCrossSite, redirectWithCookies, safeNext } from "@/lib/auth-flow";
import { isInviteeEmail } from "@/lib/invite";

// Public: a recorded Invitee signing in on a new device. A link is sent only to an Invitee who is not
// locked out and never creates an account; everyone gets the same answer so this can't be used to
// find out who is an Invitee.
export async function POST(request: Request) {
  if (isCrossSite(request)) return new Response("Cross-site request refused", { status: 403 });
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const next = safeNext(String(form.get("next") ?? "/"));

  if (!z.email().max(254).safeParse(email).success) {
    return redirectWithCookies(request, `/sign-in?error=invalid_email${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`, []);
  }
  const cookies: CookieToSet[] = [];
  if (await isInviteeEmail(email)) {
    const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
    // Always has a query string: the email template appends the token to it.
    const redirect = new URL("/auth/confirm", request.url);
    redirect.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: redirect.toString() },
    });
    if (error) console.error(`sign-in magic link failed: ${error.message}`);
  }
  return redirectWithCookies(request, "/sign-in?sent=1", cookies);
}
