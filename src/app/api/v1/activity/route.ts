import { apiJsonResponse, routes } from "@/lib/api-contract";
import { withApiErrors } from "@/lib/problem";
import { loadActivity } from "@/web/data";

export const GET = withApiErrors(async (_request: Request) => {
  return apiJsonResponse(routes.activity.responses[200], 200, await loadActivity());
});
