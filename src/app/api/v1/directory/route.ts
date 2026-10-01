import { apiJsonResponse, parseDirectoryQuery, routes } from "@/lib/api-contract";
import { withApiErrors } from "@/lib/problem";
import { loadDirectory } from "@/web/data";

export const GET = withApiErrors(async (request: Request) => {
  const query = parseDirectoryQuery(new URL(request.url).searchParams);
  return apiJsonResponse(routes.directory.responses[200], 200, await loadDirectory(query));
});
