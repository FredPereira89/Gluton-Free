import { apiJsonResponse, routes } from "@/lib/api-contract";
import { loadJobStatus } from "@/lib/job-status";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const dynamic = "force-dynamic";

export const GET = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireOwnerApi(request);
  const { id } = parseApiRequest(routes.job.request.params, await params);
  const job = await loadJobStatus(id);
  if (!job) throw new ApiError(404, "not_found", "Job not found");
  return apiJsonResponse(routes.job.responses[200], 200, job);
});
