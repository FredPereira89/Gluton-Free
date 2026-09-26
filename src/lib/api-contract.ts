import { z } from "zod";
import { CHANGE_POINT_KINDS, TIERS } from "@/domain/aspects";
import { FORMATS } from "@/domain/restaurant-facts";
import { BlocksSchema, RollupSchema } from "@/verdict/blocks";
import { parseApiRequest, problemSchema } from "./problem";

const restaurantSchema = z.strictObject({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  area: z.string().nullable(),
  format: z.string(),
  formatProvenance: z.enum(["llm", "owner", "baseline_auto"]).optional(),
  priceTier: z.enum(["€", "€€", "€€€", "€€€€"]).nullable(),
});

const verdictSchema = z.strictObject({
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  explanation: z.string().nullable(),
  issuedAt: z.iso.datetime(),
  provisional: z.boolean(),
  peerSnapshotId: z.number().int().nullable(),
  rollup: RollupSchema,
});

const sourceSchema = z.strictObject({
  code: z.string(),
  name: z.string(),
  access: z.enum(["public_ok", "personal_only"]),
  url: z.url(),
  fetchStatus: z.string(),
});

const bundleSourceSchema = sourceSchema.extend({
  kind: z.enum(["crowd", "editorial"]),
  matchProvenance: z.enum(["pasted", "proposed_confirmed", "auto_accepted"]),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  textCount: z.number().int().nullable(),
  newestAt: z.iso.datetime().nullable(),
  fetchStatus: z.enum(["not_fetched", "fetching", "fetched", "failed"]),
});

const matchEvidenceSchema = z.strictObject({
  distanceMeters: z.number().nullable(),
  phoneMatch: z.boolean().nullable(),
  nameSimilarity: z.number().min(0).max(1),
});
const listingOwnerQuestionSchema = z.strictObject({
  id: z.number().int(),
  kind: z.literal("listing_match"),
  source: z.string().min(1),
  prompt: z.string(),
  candidates: z.array(z.strictObject({
    placeRef: z.string().min(1),
    name: z.string(),
    url: z.url(),
    evidence: matchEvidenceSchema,
  })).min(1),
});
const formatOwnerQuestionSchema = z.strictObject({
  id: z.number().int(),
  kind: z.literal("format"),
  source: z.literal("google"),
  prompt: z.string(),
  proposedFormat: z.enum(FORMATS),
  googleCategory: z.string().nullable(),
});
const retrySourceOwnerQuestionSchema = z.strictObject({
  id: z.number().int(),
  kind: z.literal("retry_source"),
  source: z.enum(["google", "tripadvisor"]),
  prompt: z.string(),
});
export const ownerQuestionSchema = z.discriminatedUnion("kind", [listingOwnerQuestionSchema, formatOwnerQuestionSchema, retrySourceOwnerQuestionSchema]);
export type OwnerQuestion = z.infer<typeof ownerQuestionSchema>;

export const restaurantBundleSchema = z.strictObject({
  restaurant: restaurantSchema,
  verdict: z.strictObject({
    id: z.number().int(),
    state: z.enum(["verdict", "not_enough_evidence"]),
    tier: z.enum(TIERS).nullable(),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    explanation: z.string().nullable(),
    issuedAt: z.iso.datetime(),
    provisional: z.boolean(),
    peerSnapshotId: z.number().int().nullable().optional(),
    blocks: BlocksSchema,
  }).nullable(),
  sources: z.array(bundleSourceSchema),
  distinctions: z.array(z.strictObject({ id: z.number().int().positive().safe(), guide: z.string(), level: z.string(), editionYear: z.number().int().nullable(), url: z.url() })),
  critics: z.array(z.strictObject({
    id: z.number().int().positive().safe(), publication: z.string(), title: z.string(),
    url: z.url(), publishedOn: z.iso.date().nullable(), language: z.string().nullable(), printedRating: z.string().nullable(),
  })),
  series: RollupSchema.shape.series,
  changePoints: z.array(z.strictObject({ id: z.number().int().positive().safe(), occurredOn: z.string(), description: z.string() })),
  activeJob: z.strictObject({ id: z.number().int(), kind: z.enum(["lookup", "refresh", "baseline", "snapshot", "listing_fetch", "rejudge"]), status: z.enum(["queued", "running", "failed"]), step: z.string().nullable(), createdAt: z.iso.datetime() }).nullable(),
  ownerQuestions: z.array(ownerQuestionSchema),
});
export const quoteTranslationResponseSchema = z.strictObject({ textEn: z.string().min(1) });
export const quoteTranslationBodySchema = z.strictObject({ original: z.string().min(1).max(240) });
export type RestaurantBundle = z.infer<typeof restaurantBundleSchema>;

export const createChangePointBodySchema = z.strictObject({
  kind: z.enum(CHANGE_POINT_KINDS),
  date: z.iso.date(),
  // Settles the Owner question that proposed this Change point (issue #59), once that kind exists.
  questionId: z.number().int().positive().optional(),
});

export const createDistinctionBodySchema = z.strictObject({
  guide: z.enum(["Michelin", "Guia Repsol"]),
  level: z.string().trim().min(1).max(120),
  editionYear: z.number().int().min(1900).max(2100),
  url: z.url().refine((value) => /^https?:\/\//i.test(value)),
});
export const createDistinctionResponseSchema = z.strictObject({ id: z.number().int().positive().safe() });
export const deleteDistinctionBodySchema = z.strictObject({ id: z.number().int().positive().safe() });
export const deleteDistinctionResponseSchema = z.strictObject({ deleted: z.literal(true) });

export const createCriticPieceBodySchema = z.strictObject({
  publication: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  url: z.url().max(2048).refine((value) => /^https?:\/\//i.test(value)),
  publishedOn: z.iso.date().nullable(),
  language: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).nullable(),
  printedRating: z.string().trim().min(1).max(80).nullable(),
});
export const createCriticPieceResponseSchema = z.strictObject({ id: z.number().int().positive().safe() });
export const deleteCriticPieceBodySchema = z.strictObject({ id: z.number().int().positive().safe() });
export const deleteCriticPieceResponseSchema = z.strictObject({ deleted: z.literal(true) });

export const healthResponseSchema = z.strictObject({ status: z.literal("ok") });
export const verdictResponseSchema = z.strictObject({
  restaurant: restaurantSchema,
  verdict: verdictSchema.nullable(),
  sources: z.array(sourceSchema),
});

export const paginationQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export function parsePagination(searchParams: URLSearchParams) {
  const cursor = searchParams.get("cursor") ?? undefined;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  return parseApiRequest(paginationQuerySchema, { cursor, limit });
}

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const restaurantListItemSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  area: z.string().nullable(),
  state: z.enum(["verdict", "not_enough_evidence", "no_verdict"]),
  tier: z.enum(TIERS).nullable(),
  provisional: z.boolean().nullable(),
});
export const restaurantListResponseSchema = paginatedSchema(restaurantListItemSchema);
export type RestaurantListResponse = z.infer<typeof restaurantListResponseSchema>;
export const searchQuerySchema = z.strictObject({
  q: z.string().trim().max(2048),
  near: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});
const searchRestaurantSchema = z.strictObject({
  name: z.string(), address: z.string().nullable(), distanceMeters: z.number().int().nonnegative().nullable(),
  stars: z.number().nullable(), reviewCount: z.number().int().nonnegative().nullable(), category: z.string().nullable(),
  priceTier: z.enum(["€", "€€", "€€€", "€€€€"]).nullable(),
  status: z.enum(["open", "closed", "temporarily_closed", "unknown"]),
});
const knownSearchRestaurantSchema = searchRestaurantSchema.extend({ slug: z.string() });
const candidateSearchRestaurantSchema = searchRestaurantSchema.extend({
  placeId: z.string(), warnings: z.array(z.enum(["same_name", "outside_lisbon", "maybe_not_restaurant"])),
});
export const searchResponseSchema = z.strictObject({
  known: z.array(knownSearchRestaurantSchema),
  candidates: z.array(candidateSearchRestaurantSchema),
  recognised: z.union([knownSearchRestaurantSchema, candidateSearchRestaurantSchema]).nullable(),
  message: z.string().nullable(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
// Keyset pagination over a bigint identity column: the cursor is the last id on the page.
export const MAX_BIGINT_ID = "9223372036854775807";
export const idCursorQuerySchema = paginationQuerySchema.extend({
  cursor: z.string().refine((value) => /^[1-9][0-9]*$/.test(value) && value.length <= 19 && BigInt(value) <= BigInt(MAX_BIGINT_ID)).optional(),
});

export type IdPagination = z.infer<typeof idCursorQuerySchema>;

export function parseIdPagination(searchParams: URLSearchParams): IdPagination {
  return parseApiRequest(idCursorQuerySchema, parsePagination(searchParams));
}

export const verdictHistoryItemSchema = z.strictObject({
  id: z.number().int(),
  issuedAt: z.iso.datetime(),
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  provisional: z.boolean(),
  peerSnapshotId: z.number().int().nullable(),
});
export const verdictHistoryResponseSchema = paginatedSchema(verdictHistoryItemSchema);
export type VerdictHistoryResponse = z.infer<typeof verdictHistoryResponseSchema>;

export const acceptedJobSchema = z.strictObject({ id: z.number().int().positive() });

export function acceptedJobResponse(id: number): Response {
  const body = acceptedJobSchema.parse({ id });
  return Response.json(body, {
    status: 202,
    headers: { Location: `/api/v1/jobs/${id}`, "Retry-After": "5", "Cache-Control": "private, no-store" },
  });
}

export const previewLookupBodySchema = z.strictObject({
  googlePlaceId: z.string().min(1).optional(),
  sourceUrl: z.url().optional(),
}).refine((value) => !!value.googlePlaceId !== !!value.sourceUrl, { message: "Provide exactly one of googlePlaceId or sourceUrl" });

export const previewEvidenceSchema = matchEvidenceSchema;
export const previewListingSchema = z.strictObject({
  source: z.enum(["google", "tripadvisor"]),
  url: z.url(),
  // The raw vendor place identifier (Google place ID, Tripadvisor url_path) — kept alongside the
  // display `url` so an owner's later Accept can construct the Listing without reverse-parsing it.
  placeRef: z.string().min(1),
  name: z.string(),
  confidence: z.enum(["confident", "uncertain"]),
  autoAccept: z.boolean(),
  reviewCount: z.number().int().nonnegative().nullable(),
  evidence: previewEvidenceSchema,
});
export const previewLookupResponseSchema = z.strictObject({
  restaurantName: z.string(),
  listings: z.array(previewListingSchema),
  // Google's raw business category (e.g. "Seafood restaurant") — cuisine-flavoured, not a Format
  // value from the fixed list, so it's surfaced as unmapped vendor context, not a Format guess.
  categoryGuess: z.string().nullable(),
  estimate: z.strictObject({
    textReviews: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    minutes: z.number().int().positive(),
  }),
  notEnoughEvidenceWarning: z.boolean(),
});
export type PreviewLookupResponse = z.infer<typeof previewLookupResponseSchema>;

export const startLookupBodySchema = z.strictObject({
  googlePlaceId: z.string().trim().min(1).max(256),
  listings: z.array(previewListingSchema).max(4),
});
export const startLookupResponseSchema = z.strictObject({ jobId: z.number().int().positive(), restaurantSlug: z.string().min(1) });
export const jobResponseSchema = z.strictObject({
  id: z.number().int().positive(), restaurantSlug: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  step: z.string().nullable(), steps: z.array(z.strictObject({ name: z.string(), status: z.enum(["pending", "running", "done"]) })),
  sources: z.array(z.strictObject({ code: z.string(), name: z.string(), stars: z.number().nullable(), reviewCount: z.number().int().nullable(), textCount: z.number().int().nullable(), fetchedCount: z.number().int().nullable(), fetchStatus: z.string() })),
  facts: z.record(z.string(), z.unknown()), etaSeconds: z.number().int().nonnegative().nullable(),
  vendorUsd: z.number().nonnegative(), llmUsd: z.number().nonnegative(),
  error: z.strictObject({ code: z.string(), detail: z.string() }).nullable(),
});
export type JobResponse = z.infer<typeof jobResponseSchema>;

export const answerListingBodySchema = z.discriminatedUnion("answer", [
  z.strictObject({ answer: z.literal("accept"), placeRef: z.string().min(1) }),
  z.strictObject({ answer: z.literal("none") }),
]);
export const answerListingResponseSchema = z.strictObject({ settled: z.literal(true) });
export const restaurantFactsUpdateBodySchema = z.strictObject({
  format: z.enum(FORMATS).optional(),
  priceTier: z.enum(["€", "€€", "€€€", "€€€€"]).nullable().optional(),
}).refine((body) => body.format !== undefined || body.priceTier !== undefined);
export const restaurantFactsUpdateResponseSchema = z.strictObject({ updated: z.literal(true) });

const webPushSubscriptionSchema = z.strictObject({
  type: z.literal("web"),
  endpoint: z.url({ protocol: /^https$/ }).max(4096),
  keys: z.strictObject({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/),
  }),
});
export const pushSubscriptionBodySchema = z.discriminatedUnion("type", [webPushSubscriptionSchema]);
export const pushSubscriptionResponseSchema = z.strictObject({ id: z.number().int().positive().safe() });
export const deletePushSubscriptionResponseSchema = z.strictObject({ deleted: z.literal(true) });

export const routes = {
  health: {
    method: "GET",
    path: "/api/v1/health",
    auth: "none",
    request: {},
    responses: { 200: healthResponseSchema, 500: problemSchema },
  },
  restaurantList: {
    method: "GET",
    path: "/api/v1/restaurants",
    auth: "owner",
    request: { query: idCursorQuerySchema },
    responses: { 200: restaurantListResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  search: {
    method: "GET",
    path: "/api/v1/search",
    auth: "owner",
    request: { query: z.strictObject({ q: z.string().max(2048), near: z.string().optional() }) },
    responses: { 200: searchResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 429: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  verdict: {
    method: "GET",
    path: "/api/v1/restaurants/{slug}/verdict",
    auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }) },
    responses: { 200: verdictResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  restaurantBundle: {
    method: "GET",
    path: "/api/v1/restaurants/{slug}",
    auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }) },
    responses: { 200: restaurantBundleSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  updateRestaurantFacts: {
    method: "PATCH",
    path: "/api/v1/restaurants/{slug}",
    auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: restaurantFactsUpdateBodySchema },
    responses: { 200: restaurantFactsUpdateResponseSchema, 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  quoteTranslation: {
    method: "POST",
    path: "/api/v1/restaurants/{slug}/quotes/{reviewId}/translation",
    auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1), reviewId: z.coerce.number().int().positive().safe() }), body: quoteTranslationBodySchema },
    responses: { 200: quoteTranslationResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  verdictHistory: {
    method: "GET",
    path: "/api/v1/restaurants/{slug}/verdicts",
    auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), query: idCursorQuerySchema },
    responses: { 200: verdictHistoryResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  lookupPreview: {
    method: "POST",
    path: "/api/v1/lookups/preview",
    auth: "owner",
    request: { body: previewLookupBodySchema },
    responses: { 200: previewLookupResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 429: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  startLookup: {
    method: "POST", path: "/api/v1/lookups", auth: "owner",
    request: { body: startLookupBodySchema },
    responses: { 200: startLookupResponseSchema, 202: startLookupResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 429: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  job: {
    method: "GET", path: "/api/v1/jobs/{id}", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 200: jobResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  retryJob: {
    method: "POST", path: "/api/v1/jobs/{id}/retry", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  answerListing: {
    method: "PUT", path: "/api/v1/restaurants/{slug}/listings/{source}", auth: "owner",
    request: {
      params: z.strictObject({ slug: z.string().min(1), source: z.enum(["google", "tripadvisor"]) }),
      body: answerListingBodySchema,
    },
    responses: {
      202: z.union([answerListingResponseSchema, acceptedJobSchema]),
      400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema,
    },
  },
  createDistinction: {
    method: "POST", path: "/api/v1/restaurants/{slug}/distinctions", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: createDistinctionBodySchema },
    responses: { 201: createDistinctionResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  deleteDistinction: {
    method: "DELETE", path: "/api/v1/restaurants/{slug}/distinctions", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: deleteDistinctionBodySchema },
    responses: { 200: deleteDistinctionResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  createChangePoint: {
    method: "POST", path: "/api/v1/restaurants/{slug}/change-points", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: createChangePointBodySchema },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  deleteChangePoint: {
    method: "DELETE", path: "/api/v1/restaurants/{slug}/change-points/{id}", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1), id: z.coerce.number().int().positive().safe() }) },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  createCriticPiece: {
    method: "POST", path: "/api/v1/restaurants/{slug}/critic-pieces", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: createCriticPieceBodySchema },
    responses: { 201: createCriticPieceResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  deleteCriticPiece: {
    method: "DELETE", path: "/api/v1/restaurants/{slug}/critic-pieces", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: deleteCriticPieceBodySchema },
    responses: { 200: deleteCriticPieceResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  retrySource: {
    method: "POST", path: "/api/v1/restaurants/{slug}/listings/{source}/retry", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1), source: z.enum(["google", "tripadvisor"]) }) },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  undoListing: {
    method: "DELETE", path: "/api/v1/restaurants/{slug}/listings/{source}", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1), source: z.enum(["google", "tripadvisor"]) }) },
    responses: {
      202: acceptedJobSchema,
      400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema,
    },
  },
  dismissFormatQuestion: {
    method: "POST", path: "/api/v1/owner-questions/{id}/dismiss", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 202: answerListingResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  createPushSubscription: {
    method: "POST", path: "/api/v1/push-subscriptions", auth: "owner",
    request: { body: pushSubscriptionBodySchema },
    responses: { 201: pushSubscriptionResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  deletePushSubscription: {
    method: "DELETE", path: "/api/v1/push-subscriptions/{id}", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 200: deletePushSubscriptionResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
} as const;

type ResponseSchema = z.ZodType;
export function apiJsonResponse<S extends ResponseSchema>(schema: S, status: number, value: unknown): Response {
  return Response.json(schema.parse(value), {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
