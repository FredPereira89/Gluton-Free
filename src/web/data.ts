// Read side of the Verdict page and API. Blocks are re-validated on read.
import { db } from "@/lib/db";
import {
  MAX_BIGINT_ID, restaurantBundleSchema,
  type IdPagination, type ReportFacts, type RestaurantBundle, type RestaurantListResponse, type VerdictHistoryResponse,
} from "@/lib/api-contract";
import { BlocksSchema, type Blocks } from "@/verdict/blocks";
import { PARAMS, quarterlySourceHistory, reviewWindowCutoff } from "@/verdict/rollup";
import { trendOf } from "@/verdict/trend";
import type { DirectoryQuery, DirectoryResponse, SearchResponse } from "@/lib/api-contract";
import { buildDirectory } from "@/lib/directory";
import { bookingLink, type BookingLink } from "@/domain/booking-link";
import { dietaryFits, standoutDishes, type DietaryReview, type StandoutDishReview } from "@/domain/dish-dietary";
import { DISH_DIETARY_VERSION } from "@/analysis/dish-dietary";
import { EXTRACTOR_VERSION } from "@/analysis/extract";
import { formatQuestionPayloadSchema, formatQuestionPrompt, questionCandidates, questionPrompt } from "@/lib/owner-question";
import type { ListingSource } from "@/lib/listing-source";
import { CHANGE_POINT_LABEL, type ChangePointKind } from "@/domain/aspects";
import { normaliseName } from "@/app/api/v1/search/input";

export type StoredListingReference = {
  sourceCode: "google" | "tripadvisor" | "thefork";
  sourceUrl: string;
  placeRef?: string;
  linkedName?: string;
};

function listingIdentity(value: string, sourceCode: StoredListingReference["sourceCode"]): string | null {
  try {
    const url = new URL(value);
    if (sourceCode === "google") {
      const placeId = url.searchParams.get("query_place_id") ?? url.searchParams.get("place_id")
        ?? url.searchParams.get("q")?.match(/^place_id:([A-Za-z0-9_-]+)$/)?.[1];
      const cid = url.searchParams.get("cid");
      if (placeId) return `place_id:${placeId}`;
      if (cid) return `cid:${cid}`;
    }
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "").toLocaleLowerCase();
    return path && path !== "/" ? path : null;
  } catch {
    return null;
  }
}

function matchesListingUrl(stored: string, pasted: string, sourceCode: StoredListingReference["sourceCode"]): boolean {
  const storedIdentity = listingIdentity(stored, sourceCode);
  const pastedIdentity = listingIdentity(pasted, sourceCode);
  return storedIdentity !== null && pastedIdentity !== null && storedIdentity === pastedIdentity;
}

export async function searchKnownRestaurants(
  q: string,
  placeIds: string[],
  reference?: StoredListingReference,
): Promise<(SearchResponse["known"][number] & { placeId: string | null })[]> {
  const rows = await db()`
    select r.id, r.slug, r.name, r.address, r.status, r.price_tier,
           l.source_code, l.place_ref, l.url, l.source_rating, l.source_review_count, l.categories
    from restaurant r
    left join listing l on l.restaurant_id = r.id
    where r.status <> 'permanently_closed'
    order by r.name, r.id`;
  type Listing = { sourceCode: string; placeRef: string; url: string };
  type Restaurant = {
    id: number; slug: string; name: string; address: string | null; status: string; priceTier: string | null;
    placeId: string | null; stars: number | null; reviewCount: number | null; category: string | null; listings: Listing[];
  };
  const restaurants = new Map<number, Restaurant>();
  for (const row of rows) {
    const id = Number(row.id);
    let restaurant = restaurants.get(id);
    if (!restaurant) {
      restaurant = {
        id, slug: row.slug, name: row.name, address: row.address, status: row.status, priceTier: row.price_tier,
        placeId: null, stars: null, reviewCount: null, category: null, listings: [],
      };
      restaurants.set(id, restaurant);
    }
    if (row.source_code) {
      restaurant.listings.push({ sourceCode: row.source_code, placeRef: row.place_ref!, url: row.url! });
      if (row.source_code === "google") {
        restaurant.placeId = row.place_ref;
        restaurant.stars = row.source_rating === null ? null : Number(row.source_rating);
        restaurant.reviewCount = row.source_review_count;
        restaurant.category = row.categories?.[0] ?? null;
      }
    }
  }

  const normalizedQuery = normaliseName(q);
  const normalizedLinkedName = normaliseName(reference?.linkedName ?? "");
  const ids = new Set(placeIds);
  const found = [...restaurants.values()].filter((restaurant) => {
    if (normalizedQuery && normaliseName(restaurant.name).includes(normalizedQuery)) return true;
    if (restaurant.listings.some((listing) => listing.sourceCode === "google" && ids.has(listing.placeRef))) return true;
    if (!reference) return false;
    return restaurant.listings.some((listing) => {
      if (listing.sourceCode !== reference.sourceCode) return false;
      if (matchesListingUrl(listing.url, reference.sourceUrl, reference.sourceCode)) return true;
      if (reference.placeRef && listing.placeRef.toLocaleLowerCase() === reference.placeRef.toLocaleLowerCase()) return true;
      return !!normalizedLinkedName && reference.sourceCode !== "tripadvisor"
        && normaliseName(restaurant.name) === normalizedLinkedName;
    });
  }).slice(0, 50);

  return found.map((restaurant) => ({
    slug: restaurant.slug, name: restaurant.name, address: restaurant.address, distanceMeters: null,
    stars: restaurant.stars, reviewCount: restaurant.reviewCount, category: restaurant.category,
    priceTier: restaurant.priceTier as SearchResponse["known"][number]["priceTier"], status: restaurant.status === "temporarily_closed" ? "temporarily_closed" : "open",
    placeId: restaurant.placeId,
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
  restaurant: { id: number; slug: string; name: string; city: string; area: string | null; address?: string | null; format: string; formatProvenance: "llm" | "owner" | "baseline_auto"; priceTier: string | null; booking?: BookingLink };
  sources: SourceRow[];
  reportFacts: ReportFacts;
  verdict: { id: number; state: string; tier: string | null; confidence: string | null; explanation: string | null; createdAt: Date; blocks: Blocks; peerSnapshotId?: number | null } | null;
  distinctions: { id: number; guide: string; level: string; editionYear: number | null; url: string }[];
  critics: { id: number; publication: string; title: string; url: string; publishedOn: string | null; language: string | null; printedRating: string | null }[];
};

export async function loadVerdictPage(slug: string): Promise<VerdictPage | null> {
  const sql = db();
  const [r] = await sql`select id, slug, name, address, city, area, format, format_provenance, price_tier from restaurant where slug = ${slug}`;
  if (!r) return null;
  const id = Number(r.id);
  const [listings, [v], distinctions, critics] = await Promise.all([
    sql`
      select s.code, s.name, s.kind, s.access, l.url, l.place_ref, l.source_rating, l.source_review_count,
             l.source_text_count, l.newest_review_at, l.fetch_status, l.categories
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
  const asOf = v?.created_at instanceof Date ? v.created_at : v?.created_at ? new Date(String(v.created_at)) : new Date();
  let changePointAt = blocks?.rollup.changePointAt ? new Date(blocks.rollup.changePointAt) : null;
  if (!v) {
    const [changePoint] = await sql`
      select date from change_point where restaurant_id = ${id} and deleted_at is null and date <= ${asOf}
      order by date desc, id desc limit 1`;
    changePointAt = changePoint?.date ? new Date(changePoint.date as string) : null;
  }
  const windowSince = reviewWindowCutoff(asOf, changePointAt);
  const factRows = await sql`
    with windowed as (
      select r.id, l.source_code,
        row_number() over (partition by l.source_code order by r.published_at desc, r.id desc) as source_rank
      from review r
      join listing l on l.id = r.listing_id
      join source s on s.code = l.source_code and s.kind = 'crowd'
      where l.restaurant_id = ${id} and r.text is not null
        and r.published_at >= ${windowSince} and r.published_at <= ${asOf}
        and r.fetched_at <= ${asOf}
    )
    select w.id, f.standout_dishes, f.dietary_praise, f.dietary_complaints
    from windowed w
    join review_analysis a on a.review_id = w.id and a.extractor_version = ${EXTRACTOR_VERSION}
    join review_dish_dietary f on f.review_id = w.id and f.pass_version = ${DISH_DIETARY_VERSION}
    where w.source_rank <= ${PARAMS.reviewWindowCap}`;
  const dishReviews: StandoutDishReview[] = factRows.map((row) => ({
    reviewId: Number(row.id), dishes: row.standout_dishes as string[],
  }));
  const dietReviews: DietaryReview[] = factRows.map((row) => ({
    reviewId: Number(row.id),
    praise: row.dietary_praise as DietaryReview["praise"],
    complaints: row.dietary_complaints as DietaryReview["complaints"],
  }));
  const categories = listings.flatMap((listing) => listing.categories as string[] | null ?? []);
  const reportFacts: ReportFacts = {
    standoutDishes: standoutDishes(dishReviews),
    dietaryFits: dietaryFits(dietReviews, categories),
  };
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
      address: r.address,
      format: r.format,
      formatProvenance: r.format_provenance,
      priceTier: r.price_tier,
      booking: bookingLink({
        name: r.name,
        googlePlaceId: listings.find((l) => l.code === "google")?.place_ref ?? null,
        theForkUrl: listings.find((l) => l.code === "thefork")?.url ?? null,
      }),
    },
    reportFacts,
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
  const [job, openQuestions, listingProvenance, changePoints, sourceMatch] = await Promise.all([
    db()`
      select id, kind, status, step, created_at, progress from job
      where restaurant_id = ${page.restaurant.id} and kind <> 'source_match'
      order by id desc limit 1`.then((rows) => rows[0]),
    db()`
      select id, source_code, kind, payload from owner_question
      where restaurant_id = ${page.restaurant.id} and status = 'open' and kind in ('format', 'listing_match', 'retry_source', 'change_point')
      order by id`,
    db()`select source_code, match_provenance from listing where restaurant_id = ${page.restaurant.id}`,
    db()`
      select id, kind, date from change_point where restaurant_id = ${page.restaurant.id} and deleted_at is null
      order by date desc, id desc`,
    // Only the newest TheFork match attempt counts: a later success clears an earlier failure.
    // A run that never finished (lost trigger, killed worker) is reported as unavailable, not silence.
    db()`
      select status, error_detail, updated_at < now() - interval '15 minutes' as stale from job
      where restaurant_id = ${page.restaurant.id} and kind = 'source_match'
      order by id desc limit 1`.then((rows) => rows[0]),
  ]);
  const matchProvenanceBySource = new Map(listingProvenance.map((listing) => [listing.source_code as string, listing.match_provenance as string]));
  return restaurantBundleSchema.parse({
    restaurant: page.restaurant,
    reportFacts: page.reportFacts,
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
    changePoints: changePoints.map((c) => ({
      id: Number(c.id),
      occurredOn: new Date(c.date as string).toISOString().slice(0, 10),
      description: CHANGE_POINT_LABEL[c.kind as ChangePointKind],
    })),
    activeJob: job && job.status !== "succeeded" ? {
      id: Number(job.id), kind: job.kind, status: job.status, step: job.step, createdAt: job.created_at.toISOString(),
      ...(job.kind === "refresh" && typeof (job.progress as Record<string, unknown> | null)?.newReviews === "number"
        ? { newReviews: Math.max(0, Number((job.progress as Record<string, unknown>).newReviews)) }
        : {}),
    } : null,
    unavailableSources: sourceMatch?.status === "failed"
      ? [{ source: "thefork" as const, detail: (sourceMatch.error_detail as string | null) ?? "TheFork matching was unavailable." }]
      : sourceMatch && sourceMatch.stale && (sourceMatch.status === "queued" || sourceMatch.status === "running")
        ? [{ source: "thefork" as const, detail: "TheFork matching was unavailable: the search did not finish." }]
        : [],
    ownerQuestions: job?.kind === "lookup" && (job.status === "queued" || job.status === "running") ? [] : openQuestions.map((q) => {
      if (q.kind === "change_point") {
        const payload = q.payload as { kind: ChangePointKind; date: string; reason: "gap" | "mentions"; mentionCount: number };
        return {
          id: Number(q.id), kind: "change_point" as const,
          prompt: `Did this Restaurant change around ${payload.date}?`,
          proposedKind: payload.kind, proposedDate: payload.date,
          reason: payload.reason, mentionCount: payload.mentionCount,
        };
      }
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
          source: q.source_code as ListingSource,
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

// Every open Restaurant with a Verdict, from its latest Verdict, searched, filtered, sorted and
// paged in `buildDirectory`. About a few hundred rows, so the whole list is read once per request.
export async function loadDirectory(query: DirectoryQuery): Promise<DirectoryResponse> {
  const now = new Date();
  const rows = await db()`
    select r.slug, r.name, r.address, r.area, r.lat, r.lng, r.format, r.price_tier,
           v.state, v.tier, v.confidence, v.provisional,
           (select (s->>'percentile')::float8 from jsonb_array_elements(v.blocks->'rollup'->'standings') s where s->>'input' = 'food') as food_percentile,
           (select (s->>'percentile')::float8 from jsonb_array_elements(v.blocks->'rollup'->'standings') s where s->>'input' = 'value') as value_percentile,
           v.blocks->'rollup'->'series' as series,
           (select place_ref from listing where restaurant_id = r.id and source_code = 'google') as google_place_id,
           (select url from listing where restaurant_id = r.id and source_code = 'thefork') as thefork_url
    from restaurant r
    join lateral (select state, tier, confidence, provisional, blocks from verdict where restaurant_id = r.id order by id desc limit 1) v on true
    where r.status <> 'permanently_closed'`;
  return buildDirectory(
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      address: r.address,
      area: r.area,
      lat: r.lat,
      lng: r.lng,
      format: r.format,
      priceTier: r.price_tier,
      state: r.state,
      tier: r.tier,
      confidence: r.confidence,
      provisional: r.provisional,
      foodPercentile: r.food_percentile,
      valuePercentile: r.value_percentile,
      trend: r.state === "verdict" && !r.provisional && Array.isArray(r.series) ? trendOf(r.series, r.confidence, now) : null,
      googlePlaceId: r.google_place_id,
      theForkUrl: r.thefork_url,
    })),
    query,
  );
}
