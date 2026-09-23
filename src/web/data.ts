// Read side of the Verdict page and API. Blocks are re-validated on read.
import { db } from "@/lib/db";
import { BlocksSchema, type Blocks } from "@/verdict/blocks";

export type SourceRow = {
  code: string;
  name: string;
  kind: "crowd" | "editorial";
  access: "public_ok" | "personal_only";
  url: string;
  rating: number | null;
  reviewCount: number | null;
  textCount: number | null;
  newestAt: Date | null;
  fetchStatus: string;
};

export type VerdictPage = {
  restaurant: { id: number; slug: string; name: string; city: string; area: string | null; format: string; priceTier: string | null };
  sources: SourceRow[];
  verdict: { id: number; state: string; tier: string | null; confidence: string | null; explanation: string | null; createdAt: Date; blocks: Blocks } | null;
  distinctions: { guide: string; level: string; editionYear: number | null; url: string }[];
  critics: { publication: string; title: string; url: string; publishedOn: string | null }[];
};

export async function loadVerdictPage(slug: string): Promise<VerdictPage | null> {
  const sql = db();
  const [r] = await sql`select id, slug, name, city, area, format, price_tier from restaurant where slug = ${slug}`;
  if (!r) return null;
  const id = Number(r.id);
  const [listings, [v], distinctions, critics] = await Promise.all([
    sql`
      select s.code, s.name, s.kind, s.access, l.url, l.source_rating, l.source_review_count,
             l.source_text_count, l.newest_review_at, l.fetch_status
      from listing l join source s on s.code = l.source_code
      where l.restaurant_id = ${id} order by s.name`,
    sql`
      select id, state, tier, confidence, explanation, created_at, blocks
      from verdict where restaurant_id = ${id} order by id desc limit 1`,
    sql`select guide, level, edition_year, url from distinction where restaurant_id = ${id} order by edition_year desc nulls last`,
    sql`
      select publication, title, url, published_on::text as published_on
      from critic_piece where restaurant_id = ${id} order by published_on desc nulls last, id`,
  ]);
  return {
    restaurant: {
      id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      area: r.area,
      format: r.format,
      priceTier: r.price_tier,
    },
    sources: listings.map((l) => ({
      code: l.code,
      name: l.name,
      kind: l.kind,
      access: l.access,
      url: l.url,
      rating: l.source_rating === null ? null : Number(l.source_rating),
      reviewCount: l.source_review_count,
      textCount: l.source_text_count,
      newestAt: l.newest_review_at,
      fetchStatus: l.fetch_status,
    })),
    verdict: v
      ? {
          id: Number(v.id),
          state: v.state,
          tier: v.tier,
          confidence: v.confidence,
          explanation: v.explanation,
          createdAt: v.created_at,
          blocks: BlocksSchema.parse(v.blocks),
        }
      : null,
    distinctions: distinctions.map((d) => ({ guide: d.guide, level: d.level, editionYear: d.edition_year, url: d.url })),
    critics: critics.map((c) => ({ publication: c.publication, title: c.title, url: c.url, publishedOn: c.published_on })),
  };
}

export async function listRestaurants() {
  return db()`
    select r.slug, r.name, r.area, r.format, v.state, v.tier, v.confidence
    from restaurant r
    left join lateral (select state, tier, confidence from verdict where restaurant_id = r.id order by id desc limit 1) v on true
    order by r.name`;
}
