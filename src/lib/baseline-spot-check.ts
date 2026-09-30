import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";

export const SPOT_CHECK_TARGETS = { format: 50, tripadvisor_match: 30 } as const;
export const SPOT_CHECK_BARS = { format: 90, tripadvisor_match: 95 } as const;
export type SpotCheckKind = keyof typeof SPOT_CHECK_TARGETS;

export type SpotCheckItem = {
  id: number;
  kind: SpotCheckKind;
  slug: string;
  name: string;
  address: string | null;
  proposedFormat: string | null;
  categories: string[];
  googleUrl: string | null;
  tripadvisorUrl: string | null;
  reviews: string[];
  agreed: boolean | null;
};

export async function spotCheckState(): Promise<{ items: SpotCheckItem[]; available: { format: number; tripadvisor_match: number } }> {
  const sql = db();
  const [rows, [available]] = await Promise.all([
    sql`
      select c.id, c.kind, c.proposed_format, c.agreed, r.slug, r.name, r.address,
        coalesce(g.categories, array[]::text[]) as categories, g.url as google_url,
        c.listing_url as tripadvisor_url,
        coalesce((select array_agg(recent.text) from (
          select left(rv.text, 320) as text from review rv
          where rv.listing_id = g.id and rv.text is not null
          order by rv.published_at desc, rv.id desc limit 3
        ) recent), array[]::text[]) as reviews
      from baseline_spot_check c
      join restaurant r on r.id = c.restaurant_id
      left join listing g on g.restaurant_id = r.id and g.source_code = 'google'
      order by c.kind, c.id`,
    sql`
      select
        count(*) filter (where format_eligible)::int as formats,
        count(*) filter (where tripadvisor_listing_id is not null)::int as matches
      from baseline_spot_check_eligible`,
  ]);
  return {
    items: rows.map((row) => ({
      id: Number(row.id), kind: row.kind as SpotCheckKind, slug: String(row.slug), name: String(row.name),
      address: row.address as string | null, proposedFormat: row.proposed_format as string | null,
      categories: row.categories as string[], googleUrl: row.google_url as string | null,
      tripadvisorUrl: row.tripadvisor_url as string | null, reviews: row.reviews as string[],
      agreed: row.agreed as boolean | null,
    })),
    available: { format: Number(available!.formats), tripadvisor_match: Number(available!.matches) },
  };
}

/** Draw both samples once. The advisory lock keeps simultaneous starts from drawing twice. */
export async function startSpotCheck(): Promise<void> {
  await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('baseline_spot_check'))`;
    if ((await tx`select 1 from baseline_spot_check limit 1`).length) return;
    const [counts] = await tx`
      select
        count(*) filter (where format_eligible)::int as formats,
        count(*) filter (where tripadvisor_listing_id is not null)::int as matches
      from baseline_spot_check_eligible`;
    if (!counts || Number(counts.formats) < SPOT_CHECK_TARGETS.format || Number(counts.matches) < SPOT_CHECK_TARGETS.tripadvisor_match) {
      throw new ApiError(409, "baseline_sample_incomplete", "The baseline needs at least 50 Formats and 30 Tripadvisor matches before the checklist can start");
    }
    await tx`
      insert into baseline_spot_check (kind, restaurant_id, proposed_format)
      select 'format', restaurant_id, format from baseline_spot_check_eligible
      where format_eligible
      order by random() limit ${SPOT_CHECK_TARGETS.format}`;
    await tx`
      insert into baseline_spot_check (kind, restaurant_id, listing_id, listing_url)
      select 'tripadvisor_match', restaurant_id, tripadvisor_listing_id, tripadvisor_url
      from baseline_spot_check_eligible where tripadvisor_listing_id is not null
      order by random() limit ${SPOT_CHECK_TARGETS.tripadvisor_match}`;
  });
}

export async function answerSpotCheck(id: number, agreed: boolean): Promise<void> {
  const [updated] = await db()`
    update baseline_spot_check set agreed = ${agreed}, answered_at = now()
    where id = ${id} returning id`;
  if (!updated) throw new ApiError(404, "not_found", "Checklist item not found");
}

export function spotCheckRate(items: SpotCheckItem[], kind: SpotCheckKind) {
  const sample = items.filter((item) => item.kind === kind);
  const answered = sample.filter((item) => item.agreed !== null);
  const confirmed = answered.filter((item) => item.agreed === true).length;
  const rate = answered.length ? Math.round(confirmed / answered.length * 1000) / 10 : null;
  return {
    sampled: sample.length, answered: answered.length, confirmed, rate,
    complete: sample.length === SPOT_CHECK_TARGETS[kind] && answered.length === SPOT_CHECK_TARGETS[kind],
    passes: sample.length === SPOT_CHECK_TARGETS[kind] && answered.length === SPOT_CHECK_TARGETS[kind]
      ? confirmed / answered.length * 100 >= SPOT_CHECK_BARS[kind] : null,
  };
}
