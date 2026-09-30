import { routes } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { addTheForkLink } from "@/lib/thefork-link";

export const dynamic = "force-dynamic";

/** The owner pastes the TheFork page of a Restaurant that has no TheFork Listing. */
export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.addTheForkLink.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { url } = parseApiRequest(routes.addTheForkLink.request.body, body);
  return addTheForkLink(slug, url);
});
