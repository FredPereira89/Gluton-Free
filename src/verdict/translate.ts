import { anthropic, EXTRACT_MODEL } from "@/analysis/llm";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";

/** The analysis row is locked across the call so concurrent taps cannot buy two translations. */
export async function translateQuote(slug: string, reviewId: number, original: string): Promise<string> {
  return db().begin(async (tx) => {
    const [row] = await tx`
      select a.quote, a.quote_en, r.language
      from review_analysis a
      join review r on r.id = a.review_id
      join listing l on l.id = r.listing_id
      join restaurant restaurant on restaurant.id = l.restaurant_id
      where restaurant.slug = ${slug} and a.review_id = ${reviewId} and a.quote is not null
      for update of a`;
    if (!row) throw new ApiError(404, "not_found", "Quote not found");
    const [verdict] = await tx`
      select blocks -> 'quotes' as quotes from verdict
      where restaurant_id = (select id from restaurant where slug = ${slug})
      order by id desc limit 1`;
    const shown = (verdict?.quotes ?? []) as { reviewId: number; text: string }[];
    if (!shown.some((quote) => quote.reviewId === reviewId && quote.text === original)) {
      throw new ApiError(404, "not_found", "Quote not found in the current Verdict");
    }
    if (row.quote !== original) throw new ApiError(409, "stale_quote", "The quote has changed; reload the Verdict");
    if (row.quote_en) return row.quote_en as string;
    if ((row.language as string | null)?.startsWith("en")) return row.quote as string;
    const response = await anthropic().messages.create({
      model: EXTRACT_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: `Translate this restaurant quote into English faithfully. Return only the translation.\n\n<quote>\n${row.quote}\n</quote>` }],
    });
    const translated = response.content.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim();
    if (!translated) throw new Error("Translation returned no text");
    await tx`update review_analysis set quote_en = ${translated} where review_id = ${reviewId}`;
    return translated;
  });
}
