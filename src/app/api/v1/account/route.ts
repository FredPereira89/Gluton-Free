import { NextResponse } from "next/server";
import { parseCookieHeader } from "@supabase/ssr";
import { routes } from "@/lib/api-contract";
import { deleteInviteeAuthUser } from "@/lib/invitee-account";
import { ApiError, requireCallerApi, withApiErrors } from "@/lib/problem";

export const DELETE = withApiErrors(async (request: Request) => {
  const caller = await requireCallerApi(request, "invitee");
  if (caller.role !== "invitee") throw new ApiError(403, "forbidden", "Only an Invitee can delete this account");

  await deleteInviteeAuthUser(caller.userId);

  const response = NextResponse.json(routes.deleteMyData.responses[200].parse({ deleted: true }), {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
  });
  const authCookies = parseCookieHeader(request.headers.get("cookie") ?? "")
    .filter(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  for (const { name } of authCookies) {
    response.cookies.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
  }
  return response;
});
