import { routes } from "@/lib/api-contract";
import { parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { retrySource } from "@/lib/source-retry";

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string; source: string }> }) => {
  await requireOwnerApi(request);
  const { slug, source } = parseApiRequest(routes.retrySource.request.params, await params);
  return retrySource(slug, source);
});
