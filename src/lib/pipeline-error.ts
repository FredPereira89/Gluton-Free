// A Job's stored and exposed error is only ever a `code` + `detail` pair: never a vendor
// payload or a raw internal message.
export class PipelineError extends Error {
  constructor(public readonly code: string, public readonly detail: string, options?: { cause?: unknown }) {
    super(detail, options);
  }
}

export function toPipelineError(e: unknown): PipelineError {
  if (e instanceof PipelineError) return e;
  console.error("Lookup pipeline step failed", e);
  return new PipelineError("internal_error", "Something went wrong on our side. Retry in a few minutes.", { cause: e });
}
