import { routes } from "@/lib/api-contract";
import { rejectChangePoint } from "@/lib/change-point-rejection";
import { parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireOwnerApi(request);
  const { id } = parseApiRequest(routes.rejectChangePoint.request.params, await params);
  return rejectChangePoint(id);
});
