import { NextResponse } from "next/server";
import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";

// Only allow a same-site relative path, so `next` can't be used for an open redirect.
function safeNext(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//") && !next.includes("://")) return next;
  return "/";
}

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
    const response = NextResponse.redirect(signIn, { status: 303 });
    for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
    return response;
  }

  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
  return response;
}
