import { NextResponse } from "next/server";
import { createAuthRouteClient, type CookieToSet } from "@/lib/auth";

// Reached only through the owner-auth gate in src/proxy.ts, so no separate check is needed here.
export async function POST(request: Request) {
  const cookiesToSet: CookieToSet[] = [];
  const supabase = createAuthRouteClient(request, (cookies) => cookiesToSet.push(...cookies));
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
  for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
  return response;
}
