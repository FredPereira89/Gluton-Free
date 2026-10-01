import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { redirectWithCookies, safeNext } from "@/lib/auth-flow";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));

  const cookiesToSet: CookieToSet[] = [];
  const supabase = createAuthRouteClient(request, (cookies) => cookiesToSet.push(...cookies));

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const ownerId = process.env.OWNER_USER_ID;
  const isOwner = !error && data.user && ownerId && data.user.id === ownerId;

  if (!isOwner) {
    if (data.user) await supabase.auth.signOut();
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("error", "invalid_credentials");
    if (next !== "/") signIn.searchParams.set("next", next);
    return redirectWithCookies(request, `${signIn.pathname}${signIn.search}`, cookiesToSet);
  }

  return redirectWithCookies(request, next, cookiesToSet);
}
