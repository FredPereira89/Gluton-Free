import { z } from "zod";
import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { isCrossSite, redirectWithCookies } from "@/lib/auth-flow";
import { inviteLinkIsOpen } from "@/lib/invite";

// Public: a person holding an Invite link asks for a magic link. A dead link (revoked, exhausted,
// unknown) sends nothing, so no account is created. The Invitee is only recorded, and the use
// counted, when the emailed link is confirmed (see ../confirm).
export async function POST(request: Request) {
  if (isCrossSite(request)) return new Response("Cross-site request refused", { status: 403 });
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const page = `/invite/${encodeURIComponent(token)}`;

  if (!(await inviteLinkIsOpen(token))) return redirectWithCookies(request, page, []);
  if (!z.email().max(254).safeParse(email).success) return redirectWithCookies(request, `${page}?error=invalid_email`, []);

  const cookies: CookieToSet[] = [];
  const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${new URL(request.url).origin}/auth/confirm?invite=${token}` },
  });
  if (error) {
    console.error(`invite magic link failed: ${error.message}`);
    return redirectWithCookies(request, `${page}?error=send_failed`, cookies);
  }
  return redirectWithCookies(request, `${page}?sent=1`, cookies);
}
