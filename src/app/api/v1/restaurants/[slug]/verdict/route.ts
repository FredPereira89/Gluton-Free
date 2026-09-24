// The latest Verdict as JSON. Quotes are left out: they come from personal-only Sources.
import { apiJsonResponse, routes } from "@/lib/api-contract";
import { parseApiRequest, problemResponse, withApiErrors } from "@/lib/problem";
import { loadVerdictPage } from "@/web/data";

export const GET = withApiErrors(async (_request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = parseApiRequest(routes.verdict.request.params, await params);
  const page = await loadVerdictPage(slug);
  if (!page) return problemResponse({ status: 404, code: "not_found", message: "Restaurant not found" });
  const v = page.verdict;
  return apiJsonResponse(routes.verdict.responses[200], 200, {
    restaurant: page.restaurant,
    verdict: v && {
      state: v.state,
      tier: v.tier,
      confidence: v.confidence,
      explanation: v.explanation,
      issuedAt: v.createdAt.toISOString(),
      provisional: true,
      rollup: v.blocks.rollup,
    },
    sources: page.sources.map(({ code, name, access, url, fetchStatus }) => ({ code, name, access, url, fetchStatus })),
  });
});
