// Read side of the Verdict page and API. Blocks are re-validated on read.
import { db } from "@/lib/db";
import {
  MAX_BIGINT_ID, restaurantBundleSchema, verdictHistoryResponseSchema,
  type RestaurantBundle, type RestaurantListResponse, type VerdictHistoryResponse,
} from "@/lib/api-contract";
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

export async function loadRestaurantBundle(slug: string): Promise<RestaurantBundle | null> {
  const page = await loadVerdictPage(slug);
  if (!page) return null;
  const [job] = await db()`
    select id, kind, status, step, created_at from job
    where restaurant_id = ${page.restaurant.id} and status in ('queued', 'running')
    order by id desc limit 1`;
  return restaurantBundleSchema.parse({
    restaurant: page.restaurant,
    verdict: page.verdict && {
      id: page.verdict.id,
      state: page.verdict.state,
      tier: page.verdict.tier,
      confidence: page.verdict.confidence,
      explanation: page.verdict.explanation,
      issuedAt: page.verdict.createdAt.toISOString(),
      provisional: page.verdict.blocks.rollup.provisional,
      blocks: page.verdict.blocks,
    },
    sources: page.sources.map((source) => ({ ...source, newestAt: source.newestAt?.toISOString() ?? null })),
    distinctions: page.distinctions,
    critics: page.critics,
    series: page.verdict?.blocks.rollup.series ?? [],
    changePoints: [],
    activeJob: job ? {
      id: Number(job.id), kind: job.kind, status: job.status, step: job.step, createdAt: job.created_at.toISOString(),
    } : null,
    ownerQuestions: [],
  });
}

export async function listRestaurants({ cursor, limit }: { cursor?: string; limit: number }): Promise<RestaurantListResponse> {
  const rows = await db()`
    select r.id::text as id, r.slug, r.name, r.city, r.area, v.state, v.tier
    from restaurant r
    left join lateral (select state, tier from verdict where restaurant_id = r.id order by id desc limit 1) v on true
    where r.id > ${cursor ?? "0"}::bigint
    order by r.id
    limit ${limit + 1}`;
  const pageRows = rows.slice(0, limit);
  return {
    items: pageRows.map((r) => ({
      slug: r.slug,
      name: r.name,
      city: r.city,
      area: r.area,
      state: r.state ?? "no_verdict",
      tier: r.tier,
    })),
    nextCursor: rows.length > limit ? pageRows.at(-1)!.id : null,
  };
}

// The append-only Verdict history, newest first. Null when the Restaurant is unknown.
export async function loadVerdictHistory(
  slug: string,
  { cursor, limit }: { cursor?: string; limit: number },
): Promise<{ restaurant: { slug: string; name: string } } & VerdictHistoryResponse | null> {
  const rows = await db()`
    select r.name, v.id::text as id, v.created_at, v.state, v.tier, v.confidence, v.provisional,
           v.peer_snapshot_id::text as peer_snapshot_id
    from restaurant r
    left join verdict v on v.restaurant_id = r.id and v.id < ${cursor ?? MAX_BIGINT_ID}::bigint
    where r.slug = ${slug}
    order by v.id desc
    limit ${limit + 1}`;
  const [restaurant] = rows;
  if (!restaurant) return null;
  const verdicts = rows.filter((v) => v.id !== null);
  const pageRows = verdicts.slice(0, limit);
  return {
    restaurant: { slug, name: restaurant.name },
    ...verdictHistoryResponseSchema.parse({
      items: pageRows.map((v) => ({
        id: Number(v.id),
        issuedAt: v.created_at.toISOString(),
        state: v.state,
        tier: v.tier,
        confidence: v.confidence,
        provisional: v.provisional,
        peerSnapshotId: v.peer_snapshot_id === null ? null : Number(v.peer_snapshot_id),
      })),
      nextCursor: verdicts.length > limit ? pageRows.at(-1)!.id : null,
    }),
  };
}
