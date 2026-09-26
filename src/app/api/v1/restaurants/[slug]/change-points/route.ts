import { routes } from "@/lib/api-contract";
import { declareChangePoint } from "@/lib/change-point";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.createChangePoint.request.params, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const parsed = parseApiRequest(routes.createChangePoint.request.body, body);
  return declareChangePoint(slug, parsed);
});
