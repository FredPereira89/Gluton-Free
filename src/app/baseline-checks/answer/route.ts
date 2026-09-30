import { answerSpotCheck } from "@/lib/baseline-spot-check";
import { ApiError, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  const form = await request.formData().catch(() => { throw new ApiError(400, "invalid_request", "Invalid form"); });
  const id = Number(form.get("id"));
  const answer = form.get("answer");
  if (!Number.isSafeInteger(id) || id < 1 || (answer !== "confirm" && answer !== "reject")) {
    throw new ApiError(400, "invalid_request", "Invalid checklist answer");
  }
  await answerSpotCheck(id, answer === "confirm");
  return Response.redirect(new URL(`/baseline-checks#check-${id}`, request.url), 303);
});
