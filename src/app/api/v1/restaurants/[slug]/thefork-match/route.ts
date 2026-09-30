import { acceptedJobResponse, routes } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { retryTheForkMatch } from "@/lib/thefork-match-start";

export const dynamic = "force-dynamic";

/** The owner asks for TheFork matching again after it failed; nothing is started when it is not due. */
export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.searchTheForkAgain.request.params, await params);
  const [restaurant] = await db()`select id from restaurant where slug = ${slug}`;
  if (!restaurant) throw new ApiError(404, "not_found", "Restaurant not found");
  const jobId = await retryTheForkMatch(Number(restaurant.id));
  if (jobId === null) throw new ApiError(409, "thefork_match_not_due", "TheFork matching already ran, is running, or found a Listing");
  return acceptedJobResponse(jobId);
});
