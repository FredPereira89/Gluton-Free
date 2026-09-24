import { apiJsonResponse, parsePagination, routes } from "@/lib/api-contract";
import { parseApiRequest, withApiErrors } from "@/lib/problem";
import { listRestaurants } from "@/web/data";

export const GET = withApiErrors(async (request: Request) => {
  const query = parseApiRequest(routes.restaurantList.request.query, parsePagination(new URL(request.url).searchParams));
  return apiJsonResponse(routes.restaurantList.responses[200], 200, await listRestaurants(query));
});
