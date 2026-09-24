// Owner-auth gate: every page/route requires OWNER_USER_ID except sign-in and /api/v1/health.
// See docs/adr/0006-owner-authorization-in-the-api-layer.md.
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireOwner } from "@/lib/auth";
import { problemResponse } from "@/lib/problem";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  try {
    await requireOwner(request, {
      onSetCookies: (cookies) => {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    });
    return response;
  } catch (error) {
    const isApi = request.nextUrl.pathname.startsWith("/api/");
    if (!(error instanceof AuthError)) {
      console.error(`proxy auth check failed: ${error instanceof Error ? error.message : String(error)}`);
      const notConfigured = new AuthError(503, "not_configured", "Service unavailable");
      return isApi ? problemResponse(notConfigured) : new NextResponse(notConfigured.message, { status: 503 });
    }
    if (isApi) return problemResponse(error);
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    if (request.nextUrl.pathname !== "/") signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sign-in|api/auth/sign-in|api/v1/health).*)"],
};
