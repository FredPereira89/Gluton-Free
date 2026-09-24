import { FLAG_GROUP } from "@/domain/aspects";
import { db } from "@/lib/db";
import { redactNames } from "@/ingest/scrub";
import { EXTRACTOR_VERSION, type ExtractInput, type Extracted } from "./extract";

/** Text Reviews of a Restaurant with no analysis at the current extractor version, newest first. */
export async function pendingExtraction(restaurantId: number): Promise<ExtractInput[]> {
  const rows = await db()`
    select r.id, r.text, r.stars
    from review r
    join listing l on l.id = r.listing_id
    left join review_analysis a on a.review_id = r.id and a.extractor_version = ${EXTRACTOR_VERSION}
    where l.restaurant_id = ${restaurantId} and r.text is not null and a.review_id is null
    order by r.published_at desc`;
  return rows.map((r) => ({ id: Number(r.id), text: r.text as string, stars: r.stars as number | null }));
}

/**
 * Stores analyses and flags, and redacts the personal names the extractor found from the
 * Review text (and from the quote and flag evidence, which are spans of it).
 */
export async function saveAnalyses(results: Map<number, Extracted>, texts: Map<number, string>): Promise<void> {
  const sql = db();
  const all = [...results.values()];
  for (let i = 0; i < all.length; i += 200) {
    const part = all.slice(i, i + 200);
    const analyses = part.map((e) => ({
      review_id: e.reviewId,
      extractor_version: EXTRACTOR_VERSION,
      food: e.aspects.food,
      service: e.aspects.service,
      ambience: e.aspects.ambience,
      value: e.aspects.value,
      wait: e.aspects.wait,
      consistency: e.aspects.consistency,
      exceptional: e.exceptional,
      change: e.change,
      themes: sql.array(e.themes),
      quote: e.quote ? redactNames(e.quote.text, e.names) : null,
      quote_aspect: e.quote?.aspect ?? null,
      quote_polarity: e.quote?.polarity ?? null,
    }));
    const flags = part.flatMap((e) =>
      e.flags.map((f) => ({
        review_id: e.reviewId,
        type: f.type,
        flag_group: FLAG_GROUP[f.type],
        first_hand: f.firstHand,
        severity: f.severity,
        evidence: redactNames(f.evidence, e.names),
      })),
    );
    const redactions = part.flatMap((e) => {
      const original = texts.get(e.reviewId);
      if (!original || !e.names.length) return [];
      const redacted = redactNames(original, e.names);
      return redacted === original ? [] : [{ id: e.reviewId, text: redacted }];
    });
    const ids = part.map((e) => e.reviewId);
    await sql.begin(async (tx) => {
      for (const r of redactions) await tx`update review set text = ${r.text} where id = ${r.id}`;
      await tx`
        insert into review_analysis ${tx(analyses as never)}
        on conflict (review_id) do update set
          extractor_version = excluded.extractor_version, food = excluded.food, service = excluded.service,
          ambience = excluded.ambience, value = excluded.value, wait = excluded.wait,
          consistency = excluded.consistency, exceptional = excluded.exceptional, change = excluded.change, themes = excluded.themes,
          quote = excluded.quote, quote_aspect = excluded.quote_aspect, quote_polarity = excluded.quote_polarity,
          quote_en = null, analysed_at = now()`;
      await tx`delete from review_flag where review_id in ${tx(ids)}`;
      if (flags.length) await tx`insert into review_flag ${tx(flags as never)} on conflict (review_id, type) do nothing`;
    });
  }
}
