// Browser-safe half of problem.ts: no auth or database imports, so api-contract (and the client
// components that import it) never pull the server-only chain into the browser bundle.
import { z } from "zod";

export const problemSchema = z.strictObject({
  type: z.literal("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  resetAt: z.iso.datetime().optional(),
});

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly extra?: { resetAt?: string }) {
    super(message);
  }
}

export function parseApiRequest<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "invalid_request", "Invalid request");
  return result.data;
}
