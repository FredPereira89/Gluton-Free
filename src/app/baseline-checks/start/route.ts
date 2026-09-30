import { startSpotCheck } from "@/lib/baseline-spot-check";
import { requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request) => {
  await requireOwnerApi(request);
  await startSpotCheck();
  return Response.redirect(new URL("/baseline-checks", request.url), 303);
});
