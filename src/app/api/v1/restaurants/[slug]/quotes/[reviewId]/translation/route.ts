import { z } from "zod";
import { apiJsonResponse, quoteTranslationBodySchema, quoteTranslationResponseSchema } from "@/lib/api-contract";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";
import { translateQuote } from "@/verdict/translate";

const paramsSchema = z.strictObject({ slug: z.string().min(1), reviewId: z.coerce.number().int().positive().safe() });

export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ slug: string; reviewId: string }> }) => {
  await requireOwnerApi(request);
  const { slug, reviewId } = parseApiRequest(paramsSchema, await params);
  const body = await request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
  const { original } = parseApiRequest(quoteTranslationBodySchema, body);
  return apiJsonResponse(quoteTranslationResponseSchema, 200, { textEn: await translateQuote(slug, reviewId, original) });
});
