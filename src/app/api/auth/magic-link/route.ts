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
  const signInPath = (params: Record<string, string>) => {
    const query = new URLSearchParams(params);
    if (next !== "/") query.set("next", next);
    return `/sign-in?${query}`;
  };

  if (!z.email().max(254).safeParse(email).success) {
    return redirectWithCookies(request, signInPath({ error: "invalid_email" }), []);
  }
  const cookies: CookieToSet[] = [];
  if (await isInviteeEmail(email)) {
    const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
    const redirectTo = new URL("/auth/confirm", request.url);
    if (next !== "/") redirectTo.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo.toString() },
    });
    if (error) console.error(`sign-in magic link failed: ${error.message}`);
  }
  return redirectWithCookies(request, signInPath({ sent: "1" }), cookies);
}
