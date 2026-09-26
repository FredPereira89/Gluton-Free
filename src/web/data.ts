// Read side of the Verdict page and API. Blocks are re-validated on read.
import { db } from "@/lib/db";
import {
  MAX_BIGINT_ID, restaurantBundleSchema,
  type IdPagination, type RestaurantBundle, type RestaurantListResponse, type VerdictHistoryResponse,
} from "@/lib/api-contract";
import { BlocksSchema, type Blocks } from "@/verdict/blocks";
import { quarterlySourceHistory } from "@/verdict/rollup";
import type { SearchResponse } from "@/lib/api-contract";
import { formatQuestionPayloadSchema, formatQuestionPrompt, questionCandidates, questionPrompt } from "@/lib/owner-question";

export async function searchKnownRestaurants(q: string, placeIds: string[]): Promise<(SearchResponse["known"][number] & { placeId: string | null })[]> {
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db()`
    select r.slug, r.name, r.address, r.status, r.price_tier, l.place_ref,
           l.source_rating, l.source_review_count, l.categories
    from restaurant r
    left join listing l on l.restaurant_id = r.id and l.source_code = 'google'
    where ((${q.length > 0} and r.name ilike ${pattern} escape '\\') or l.place_ref = any(${placeIds}::text[]))
      and r.status <> 'permanently_closed'
    order by (l.place_ref = any(${placeIds}::text[])) desc, r.name, r.id limit 50`;
  return rows.map((row) => ({
    slug: row.slug, name: row.name, address: row.address, distanceMeters: null,
    stars: row.source_rating === null ? null : Number(row.source_rating),
    reviewCount: row.source_review_count, category: row.categories?.[0] ?? null,
    priceTier: row.price_tier, status: row.status === "temporarily_closed" ? "temporarily_closed" : "open",
    placeId: row.place_ref,
  }));
}

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
  restaurant: { id: number; slug: string; name: string; city: string; area: string | null; format: string; formatProvenance: "llm" | "owner" | "baseline_auto"; priceTier: string | null };
  sources: SourceRow[];
  verdict: { id: number; state: string; tier: string | null; confidence: string | null; explanation: string | null; createdAt: Date; blocks: Blocks; peerSnapshotId?: number | null } | null;
  distinctions: { id: number; guide: string; level: string; editionYear: number | null; url: string }[];
  critics: { id: number; publication: string; title: string; url: string; publishedOn: string | null; language: string | null; printedRating: string | null }[];
};

export async function loadVerdictPage(slug: string): Promise<VerdictPage | null> {
  const sql = db();
  const [r] = await sql`select id, slug, name, city, area, format, format_provenance, price_tier from restaurant where slug = ${slug}`;
  if (!r) return null;
  const id = Number(r.id);
  const [listings, [v], distinctions, critics] = await Promise.all([
    sql`
      select s.code, s.name, s.kind, s.access, l.url, l.source_rating, l.source_review_count,
             l.source_text_count, l.newest_review_at, l.fetch_status
      from listing l join source s on s.code = l.source_code
      where l.restaurant_id = ${id} order by s.name`,
    sql`
      select id, state, tier, confidence, explanation, created_at, blocks, peer_snapshot_id
      from verdict where restaurant_id = ${id} order by id desc limit 1`,
    sql`select id, guide, level, edition_year, url from distinction where restaurant_id = ${id} order by edition_year desc nulls last, id desc`,
    sql`
      select id, publication, title, url, published_on::text as published_on, language, printed_rating
      from critic_piece where restaurant_id = ${id} order by published_on desc nulls last, id`,
  ]);
  const blocks = v ? BlocksSchema.parse(v.blocks) : null;
  if (blocks) {
    const accessBySource = new Map(listings.map((listing) => [listing.code as string, listing.access as "public_ok" | "personal_only"]));
    for (const quote of blocks.quotes) quote.access = accessBySource.get(quote.source) ?? quote.access;
    if (blocks.quotes.length) {
      const cached = await sql`
        select review_id, quote, quote_en from review_analysis
        where review_id in ${sql(blocks.quotes.map((quote) => quote.reviewId))}`;
      const translations = new Map(cached.map((row) => [Number(row.review_id), row]));
      for (const quote of blocks.quotes) {
        const row = translations.get(quote.reviewId);
        if (row?.quote === quote.text && row.quote_en) quote.textEn = row.quote_en as string;
      }
    }
  }
  // Earlier append-only Verdicts predate stored Source history. Reconstruct only from Reviews
  // already fetched by issuance, so their charts stay fixed without changing the Verdict row.
  if (v && blocks && !blocks.rollup.sourceHistory) {
    const rows = await sql`
      select l.source_code, rv.published_at, rv.stars
      from review rv join listing l on l.id = rv.listing_id
      where l.restaurant_id = ${id}
        and rv.fetched_at <= ${v.created_at}
        and rv.published_at <= ${v.created_at}`;
    blocks.rollup.sourceHistory = quarterlySourceHistory(rows.map((row) => ({
      source: row.source_code as string,
      publishedAt: row.published_at as Date,
      stars: row.stars as number | null,
    })), v.created_at as Date, listings.filter((listing) => listing.kind === "crowd").map((listing) => listing.code as string));
  }
  return {
    restaurant: {
      id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      area: r.area,
      format: r.format,
      formatProvenance: r.format_provenance,
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
          blocks: blocks!,
          peerSnapshotId: v.peer_snapshot_id === null ? null : Number(v.peer_snapshot_id),
        }
      : null,
    distinctions: distinctions.map((d) => ({ id: Number(d.id), guide: d.guide, level: d.level, editionYear: d.edition_year, url: d.url })),
    critics: critics.map((c) => ({
      id: Number(c.id), publication: c.publication, title: c.title, url: c.url,
      publishedOn: c.published_on, language: c.language, printedRating: c.printed_rating,
    })),
  };
}

export async function loadRestaurantBundle(slug: string): Promise<RestaurantBundle | null> {
  const page = await loadVerdictPage(slug);
  if (!page) return null;
  const [job, openQuestions, listingProvenance] = await Promise.all([
    db()`
      select id, kind, status, step, created_at from job
      where restaurant_id = ${page.restaurant.id}
      order by id desc limit 1`.then((rows) => rows[0]),
    db()`
      select id, source_code, kind, payload from owner_question
      where restaurant_id = ${page.restaurant.id} and status = 'open' and kind in ('format', 'listing_match', 'retry_source')
      order by id`,
    db()`select source_code, match_provenance from listing where restaurant_id = ${page.restaurant.id}`,
  ]);
  const matchProvenanceBySource = new Map(listingProvenance.map((listing) => [listing.source_code as string, listing.match_provenance as string]));
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
      peerSnapshotId: page.verdict.peerSnapshotId ?? null,
      blocks: page.verdict.blocks,
    },
    sources: page.sources.map((source) => ({
      ...source,
      matchProvenance: matchProvenanceBySource.get(source.code),
      newestAt: source.newestAt?.toISOString() ?? null,
    })),
    distinctions: page.distinctions,
    critics: page.critics,
    series: page.verdict?.blocks.rollup.series ?? [],
    changePoints: [],
    activeJob: job && job.status !== "succeeded" ? {
      id: Number(job.id), kind: job.kind, status: job.status, step: job.step, createdAt: job.created_at.toISOString(),
    } : null,
    ownerQuestions: job?.kind === "lookup" && (job.status === "queued" || job.status === "running") ? [] : openQuestions.map((q) => {
      if (q.kind === "format") {
        const payload = formatQuestionPayloadSchema.parse(q.payload);
        return {
          id: Number(q.id),
          kind: "format" as const,
          source: "google" as const,
          prompt: formatQuestionPrompt(payload.googleCategory, payload.proposedFormat),
          proposedFormat: payload.proposedFormat,
          googleCategory: payload.googleCategory,
        };
      }
      if (q.kind === "retry_source") {
        const name = page.sources.find((source) => source.code === q.source_code)?.name ?? String(q.source_code);
        return {
          id: Number(q.id),
          kind: "retry_source" as const,
          source: q.source_code as "google" | "tripadvisor",
          prompt: `Retry ${name}`,
        };
      }
      const candidates = questionCandidates(q.payload);
      return {
        id: Number(q.id),
        kind: "listing_match" as const,
        source: q.source_code as string,
        prompt: questionPrompt(q.source_code as string),
        candidates: candidates.map(({ placeRef, name, url, evidence }) => ({ placeRef, name, url, evidence })),
      };
    }),
  });
}

export async function listRestaurants({ cursor, limit }: IdPagination): Promise<RestaurantListResponse> {
  const rows = await db()`
    select r.id::text as id, r.slug, r.name, r.city, r.area, v.state, v.tier, v.provisional
    from restaurant r
    left join lateral (select state, tier, provisional from verdict where restaurant_id = r.id order by id desc limit 1) v on true
    where r.id > ${cursor ?? "0"}::bigint
      and exists (select 1 from job j where j.restaurant_id = r.id and j.kind = 'lookup')
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
      provisional: r.provisional,
    })),
    nextCursor: rows.length > limit ? pageRows.at(-1)!.id : null,
  };
}

// The append-only Verdict history, newest first. Null when the Restaurant is unknown.
export async function loadVerdictHistory(
  slug: string,
  { cursor, limit }: IdPagination,
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
  };
}
