// Auth gate: protected pages/routes require OWNER_USER_ID, except sign-in, Invite link redemption and its auth routes,
// /api/v1/health, and routes the registry opens to Invitees. The landing page is public but recognizes signed-in callers.
// See docs/adr/0006-owner-authorization-in-the-api-layer.md and 0008.
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireCaller } from "@/lib/auth";
import { problemResponse } from "@/lib/problem";
import { requiredAuthLevel } from "@/lib/route-auth";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const isLandingPage = pathname === "/";
  if (pathname === "/privacy") return response;
  try {
    const level = isLandingPage ? "invitee" : requiredAuthLevel(request.method, request.nextUrl.pathname);
    if (level === "none") return response;
    await requireCaller(request, level, {
      onSetCookies: (cookies) => {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    });
    return response;
  } catch (error) {
    if (isLandingPage && error instanceof AuthError) return response;
    const isApi = request.nextUrl.pathname.startsWith("/api/");
    if (!(error instanceof AuthError)) {
      console.error(`proxy auth check failed: ${error instanceof Error ? error.message : String(error)}`);
      const notConfigured = new AuthError(503, "not_configured", "Service unavailable");
      return isApi ? problemResponse(notConfigured) : new NextResponse(notConfigured.message, { status: 503 });
    }
    if (isApi) return problemResponse(error);
    // Signed in but not the Owner (an Invitee): every page is Owner-only for now, so show them the welcome page, not a sign-in form.
    if (error.status === 403 && error.code === "forbidden") {
      const welcome = request.nextUrl.clone();
      welcome.pathname = "/welcome";
      welcome.search = "";
      return NextResponse.redirect(welcome);
    }
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    if (request.nextUrl.pathname !== "/") signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sign-in|welcome|invite/|auth/confirm|api/auth/sign-in|api/auth/invite|api/auth/magic-link|api/auth/callback|api/auth/confirm|api/auth/sign-out|api/v1/health|openapi.json).*)"],
};
