// The append-only Verdict history, newest first, cursor-paginated.
import { apiJsonResponse, parseIdPagination, routes } from "@/lib/api-contract";
import { parseApiRequest, problemResponse, withApiErrors } from "@/lib/problem";
import { loadVerdictHistory } from "@/web/data";

export const GET = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = parseApiRequest(routes.verdictHistory.request.params, await params);
  const query = parseIdPagination(new URL(request.url).searchParams);
  const history = await loadVerdictHistory(slug, query);
  if (!history) return problemResponse({ status: 404, code: "not_found", message: "Restaurant not found" });
  return apiJsonResponse(routes.verdictHistory.responses[200], 200, { items: history.items, nextCursor: history.nextCursor });
});
