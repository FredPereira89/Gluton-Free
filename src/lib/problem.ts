import { z } from "zod";

export const problemSchema = z.strictObject({
  type: z.literal("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
});

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

// RFC 9457 application/problem+json.
export function problemResponse(err: { status: number; code: string; message: string }): Response {
  const title = err.status === 400 ? "Bad request" : err.status === 401 ? "Unauthenticated" : err.status === 403 ? "Forbidden" : err.status === 404 ? "Not found" : err.status === 500 ? "Internal server error" : "Service unavailable";
  return Response.json(
    problemSchema.parse({ type: "about:blank", title, status: err.status, detail: err.message, code: err.code }),
    { status: err.status, headers: { "content-type": "application/problem+json", "Cache-Control": "private, no-store" } },
  );
}

export function withApiErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) return problemResponse(error);
      console.error("API handler failed", error);
      return problemResponse({ status: 500, code: "internal_error", message: "Service unavailable" });
    }
  };
}

export function parseApiRequest<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "invalid_request", "Invalid request");
  return result.data;
}
