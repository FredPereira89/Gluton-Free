import { z } from "zod";
import { apiJsonResponse, quoteTranslationResponseSchema } from "@/lib/api-contract";
import { parseApiRequest, withApiErrors } from "@/lib/problem";
import { translateQuote } from "@/verdict/translate";

const paramsSchema = z.strictObject({ slug: z.string().min(1), reviewId: z.coerce.number().int().positive().safe() });

export const POST = withApiErrors(async (_request: Request, { params }: { params: Promise<{ slug: string; reviewId: string }> }) => {
  const { slug, reviewId } = parseApiRequest(paramsSchema, await params);
  return apiJsonResponse(quoteTranslationResponseSchema, 200, { textEn: await translateQuote(slug, reviewId) });
});
