import { NextResponse } from "next/server";
import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";
import { isCrossSite } from "@/lib/auth-flow";

// Public: anyone signed in, Invitees included, can end their own session. Refuses other sites so a
// page elsewhere can't sign people out.
export async function POST(request: Request) {
  if (isCrossSite(request)) return new Response("Cross-site request refused", { status: 403 });
  const cookiesToSet: CookieToSet[] = [];
  const supabase = createAuthRouteClient(request, (cookies) => cookiesToSet.push(...cookies));
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
  for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
  return response;
}
