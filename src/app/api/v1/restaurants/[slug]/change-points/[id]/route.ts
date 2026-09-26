import { routes } from "@/lib/api-contract";
import { deleteChangePoint } from "@/lib/change-point";
import { parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const DELETE = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) => {
  await requireOwnerApi(request);
  const { slug, id } = parseApiRequest(routes.deleteChangePoint.request.params, await params);
  return deleteChangePoint(slug, id);
});
