import { routes } from "@/lib/api-contract";
import { retryJob } from "@/lib/job-retry";
import { parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

export const dynamic = "force-dynamic";

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireOwnerApi(request);
  const { id } = parseApiRequest(routes.retryJob.request.params, await params);
  return retryJob(id);
});
