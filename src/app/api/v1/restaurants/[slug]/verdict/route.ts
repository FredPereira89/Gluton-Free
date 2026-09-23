// The latest Verdict as JSON. Quotes are left out: they come from personal-only Sources.
import { NextResponse } from "next/server";
import { loadVerdictPage } from "@/web/data";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadVerdictPage(slug);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const v = page.verdict;
  return NextResponse.json({
    restaurant: page.restaurant,
    verdict: v && {
      state: v.state,
      tier: v.tier,
      confidence: v.confidence,
      explanation: v.explanation,
      issuedAt: v.createdAt,
      provisional: true,
      rollup: v.blocks.rollup,
    },
    sources: page.sources.map(({ code, name, access, url, fetchStatus }) => ({ code, name, access, url, fetchStatus })),
  });
}
