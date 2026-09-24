import { apiJsonResponse, routes } from "@/lib/api-contract";
import { withApiErrors } from "@/lib/problem";

// Unauthenticated and data-free: see src/proxy.ts's matcher exclusion.
export const GET = withApiErrors(async () => {
  return apiJsonResponse(routes.health.responses[200], 200, { status: "ok" });
});
