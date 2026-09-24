import { AuthError } from "@/lib/auth";

// RFC 9457 application/problem+json.
export function problemResponse(err: AuthError): Response {
  const title = err.status === 401 ? "Unauthenticated" : err.status === 403 ? "Forbidden" : "Service unavailable";
  return Response.json(
    { type: "about:blank", title, status: err.status, detail: err.message, code: err.code },
    { status: err.status, headers: { "content-type": "application/problem+json" } },
  );
}
