import { z } from "zod";
import { CHANGE_POINT_KINDS, TIERS } from "@/domain/aspects";
import { FORMAT_FAMILIES } from "@/domain/format-labels";
import { FORMATS } from "@/domain/restaurant-facts";
import { DIETS } from "@/domain/dish-dietary";
import { VERDICT_FEEDBACK_JUDGEMENTS } from "@/domain/verdict-feedback";
import { BlocksSchema, RollupSchema, ShownQuoteSchema } from "@/verdict/blocks";
import {
  createInviteLinkBodySchema, inviteLinkListResponseSchema, inviteLinkSchema, inviteeListResponseSchema, inviteeSchema,
  revokeInviteLinkResponseSchema, setInviteeLockOutBodySchema,
} from "./invite-contract";
import { LISTING_SOURCES } from "./listing-source";
import { parseApiRequest, problemSchema } from "./problem-schema";

// Where to book or find a Restaurant: TheFork when it has a Listing there, otherwise Google Maps.
export const bookingLinkSchema = z.strictObject({ label: z.string(), url: z.url(), kind: z.enum(["thefork", "google_maps"]) });

const restaurantSchema = z.strictObject({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  area: z.string().nullable(),
  address: z.string().nullable().optional(),
  format: z.string(),
  formatProvenance: z.enum(["llm", "owner", "baseline_auto"]).optional(),
  priceTier: z.enum(["€", "€€", "€€€", "€€€€"]).nullable(),
  booking: bookingLinkSchema.optional(),
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
  source: z.enum(LISTING_SOURCES),
  prompt: z.string(),
});
const changePointOwnerQuestionSchema = z.strictObject({
  id: z.number().int(), kind: z.literal("change_point"), prompt: z.string(),
  proposedKind: z.enum(CHANGE_POINT_KINDS), proposedDate: z.iso.date(),
  reason: z.enum(["gap", "mentions"]), mentionCount: z.number().int().nonnegative(),
});
export const ownerQuestionSchema = z.discriminatedUnion("kind", [listingOwnerQuestionSchema, formatOwnerQuestionSchema, retrySourceOwnerQuestionSchema, changePointOwnerQuestionSchema]);
export type OwnerQuestion = z.infer<typeof ownerQuestionSchema>;

const bundleVerdictSchema = z.strictObject({
  id: z.number().int(),
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  explanation: z.string().nullable(),
  issuedAt: z.iso.datetime(),
  provisional: z.boolean(),
  peerSnapshotId: z.number().int().nullable().optional(),
  blocks: BlocksSchema,
});

export const reportFactsSchema = z.strictObject({
  standoutDishes: z.array(z.strictObject({ name: z.string().trim().min(1), count: z.number().int().min(3) })).max(3),
  dietaryFits: z.array(z.enum(DIETS)).max(DIETS.length),
});
export type ReportFacts = z.infer<typeof reportFactsSchema>;

export const restaurantBundleSchema = z.strictObject({
  restaurant: restaurantSchema,
  verdict: bundleVerdictSchema.nullable(),
  reportFacts: reportFactsSchema,
  sources: z.array(bundleSourceSchema),
  distinctions: z.array(z.strictObject({ id: z.number().int().positive().safe(), guide: z.string(), level: z.string(), editionYear: z.number().int().nullable(), url: z.url() })),
  critics: z.array(z.strictObject({
    id: z.number().int().positive().safe(), publication: z.string(), title: z.string(),
    url: z.url(), publishedOn: z.iso.date().nullable(), language: z.string().nullable(), printedRating: z.string().nullable(),
  })),
  series: RollupSchema.shape.series,
  changePoints: z.array(z.strictObject({ id: z.number().int().positive().safe(), occurredOn: z.string(), description: z.string() })),
  activeJob: z.strictObject({
    id: z.number().int(), kind: z.enum(["lookup", "refresh", "baseline", "snapshot", "listing_fetch", "rejudge"]),
    status: z.enum(["queued", "running", "failed"]), step: z.string().nullable(), createdAt: z.iso.datetime(),
    newReviews: z.number().int().nonnegative().optional(),
  }).nullable(),
  ownerQuestions: z.array(ownerQuestionSchema),
  // Sources whose background matching could not run, so the owner knows a Source is missing for that reason.
  unavailableSources: z.array(z.strictObject({ source: z.enum(["thefork"]), detail: z.string() })),
});
export const quoteTranslationResponseSchema = z.strictObject({ textEn: z.string().min(1) });
export const quoteTranslationBodySchema = z.strictObject({ original: z.string().min(1).max(240) });
export type RestaurantBundle = z.infer<typeof restaurantBundleSchema>;

// What an Invitee reads of the same Restaurant (ADR 0008). Review text survives only from public-OK
// Sources; the Sources table, Owner questions, the active job and the proposed Format marker are gone.
const redFlagSchema = RollupSchema.shape.redFlags.element;
const inviteeRollupSchema = RollupSchema.extend({
  redFlags: z.array(redFlagSchema.extend({
    incidents: z.array(redFlagSchema.shape.incidents.unwrap().element.extend({ evidence: z.string().optional() })).optional(),
  })),
});
export const inviteeBundleSchema = restaurantBundleSchema
  .omit({ sources: true, activeJob: true, ownerQuestions: true, unavailableSources: true })
  .extend({
    restaurant: restaurantSchema.omit({ formatProvenance: true }),
    verdict: bundleVerdictSchema.extend({
      blocks: z.strictObject({
        rollup: inviteeRollupSchema,
        quotes: z.array(ShownQuoteSchema.extend({ access: z.literal("public_ok") })),
      }),
    }).nullable(),
    sourceNames: z.record(z.string(), z.string()),
  });
export type InviteeBundle = z.infer<typeof inviteeBundleSchema>;

export const createChangePointBodySchema = z.strictObject({
  kind: z.enum(CHANGE_POINT_KINDS),
  date: z.iso.date(),
  questionId: z.number().int().positive().optional(),
});
export const rejectChangePointResponseSchema = z.strictObject({ settled: z.literal(true) });

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

export const verdictFeedbackJudgementSchema = z.enum(VERDICT_FEEDBACK_JUDGEMENTS);
export type VerdictFeedbackJudgement = z.infer<typeof verdictFeedbackJudgementSchema>;
export const verdictFeedbackSchema = z.strictObject({
  verdictId: z.number().int().positive().safe(),
  judgement: verdictFeedbackJudgementSchema,
  eatenHere: z.boolean().nullable(),
  note: z.string().nullable(),
  submittedAt: z.iso.datetime(),
});
export type VerdictFeedback = z.infer<typeof verdictFeedbackSchema>;
export const verdictFeedbackResponseSchema = z.strictObject({ feedback: verdictFeedbackSchema.nullable() });
export const verdictFeedbackSubmissionSchema = z.strictObject({
  verdictId: z.number().int().positive().safe(),
  judgement: verdictFeedbackJudgementSchema,
  eatenHere: z.boolean().nullable(),
  note: z.string().trim().max(1000).nullable(),
});
export type VerdictFeedbackSubmission = z.infer<typeof verdictFeedbackSubmissionSchema>;

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

// The directory: every Restaurant with a Verdict, searched, filtered, sorted and paged on the
// server. Its state lives in the URL, so the query is read from URL parameters (repeat a parameter
// to pick several values: ?tier=good&tier=must_go).
export const PRICE_TIERS = ["€", "€€", "€€€", "€€€€"] as const;
export const DIRECTORY_SORTS = ["tier", "food", "value", "price", "name"] as const;
export const DIRECTORY_DEFAULT_PAGE_SIZE = 24;
export const directoryQuerySchema = z.strictObject({
  // As long as the lookup input, so a pasted link stays in the URL with the rest of the state.
  q: z.string().trim().max(2048).default(""),
  sort: z.enum(DIRECTORY_SORTS).default("tier"),
  tier: z.array(z.enum(TIERS)).default([]),
  family: z.array(z.enum(FORMAT_FAMILIES.map((family) => family.code))).default([]),
  price: z.array(z.enum(PRICE_TIERS)).default([]),
  area: z.array(z.string().trim().min(1).max(80)).default([]),
  diet: z.array(z.enum(DIETS)).default([]),
  // Not enough evidence Restaurants are hidden unless asked for.
  nee: z.boolean().default(false),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(DIRECTORY_DEFAULT_PAGE_SIZE),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

export function parseDirectoryQuery(searchParams: URLSearchParams): DirectoryQuery {
  const one = (name: string) => searchParams.get(name) ?? undefined;
  const number = (name: string) => (searchParams.has(name) ? Number(searchParams.get(name)) : undefined);
  const nee = one("nee");
  return parseApiRequest(directoryQuerySchema, {
    q: one("q"),
    sort: one("sort"),
    tier: searchParams.getAll("tier"),
    family: searchParams.getAll("family"),
    price: searchParams.getAll("price"),
    area: searchParams.getAll("area"),
    diet: searchParams.getAll("diet"),
    nee: nee === "1" || nee === "true" ? true : nee === "0" || nee === "false" ? false : nee,
    page: number("page"),
    pageSize: number("pageSize"),
  });
}

export const directoryItemSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  provisional: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  // The human label, never the stored code.
  format: z.string(),
  formatFamily: z.enum(FORMAT_FAMILIES.map((family) => family.code)).nullable(),
  priceTier: z.enum(PRICE_TIERS).nullable(),
  neighbourhood: z.string(),
  // Null where the Trend rule hides it (Low Confidence, under a year of Reviews).
  trend: z.enum(["improving", "steady", "slipping"]).nullable(),
  dietaryFits: z.array(z.enum(DIETS)).default([]),
  booking: bookingLinkSchema,
});
export const directoryResponseSchema = z.strictObject({
  items: z.array(directoryItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().min(1),
  // Not enough evidence Restaurants the other filters would show, left out unless nee is on.
  hiddenNotEnoughEvidence: z.number().int().nonnegative(),
  // Every neighbourhood in the directory, for the filter, whatever else is filtered.
  neighbourhoods: z.array(z.strictObject({ name: z.string(), count: z.number().int().positive() })),
});
export type DirectoryResponse = z.infer<typeof directoryResponseSchema>;
export type DirectoryItem = z.infer<typeof directoryItemSchema>;
export const searchQuerySchema = z.strictObject({
  q: z.string().trim().max(2048),
});
export const searchAddBodySchema = z.strictObject({ q: z.string().trim().min(1).max(2048) });
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

// Who may call a route: nobody-in-particular ("none", data-free only), the Owner alone, or the Owner
// and any Invitee (ADR 0008). Every route declares its level; owner is the default for new routes.
export type AuthLevel = "none" | "owner" | "invitee";

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
    auth: "invitee",
    request: { query: idCursorQuerySchema },
    responses: { 200: restaurantListResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  directory: {
    method: "GET",
    path: "/api/v1/directory",
    auth: "invitee",
    request: { query: directoryQuerySchema },
    responses: { 200: directoryResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  search: {
    method: "GET",
    path: "/api/v1/search",
    auth: "invitee",
    request: { query: searchQuerySchema },
    responses: { 200: searchResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  searchAdd: {
    method: "POST", path: "/api/v1/search/add", auth: "owner",
    request: { body: searchAddBodySchema },
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
    auth: "invitee",
    request: { params: z.strictObject({ slug: z.string().min(1) }) },
    responses: { 200: z.union([restaurantBundleSchema, inviteeBundleSchema]), 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  verdictFeedback: {
    method: "GET", path: "/api/v1/restaurants/{slug}/verdict-feedback", auth: "invitee",
    request: { params: z.strictObject({ slug: z.string().min(1) }) },
    responses: { 200: verdictFeedbackResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  saveVerdictFeedback: {
    method: "PUT", path: "/api/v1/restaurants/{slug}/verdict-feedback", auth: "invitee",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: verdictFeedbackSubmissionSchema },
    responses: { 200: verdictFeedbackResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
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
    auth: "invitee",
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
      params: z.strictObject({ slug: z.string().min(1), source: z.enum(LISTING_SOURCES) }),
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
  rejectChangePoint: {
    method: "POST", path: "/api/v1/owner-questions/{id}/reject-change-point", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 200: rejectChangePointResponseSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema },
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
    request: { params: z.strictObject({ slug: z.string().min(1), source: z.enum(LISTING_SOURCES) }) },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  searchTheForkAgain: {
    method: "POST", path: "/api/v1/restaurants/{slug}/thefork-match", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }) },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  addTheForkLink: {
    method: "POST", path: "/api/v1/restaurants/{slug}/thefork-link", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1) }), body: z.strictObject({ url: z.string().min(1).max(500) }) },
    responses: { 202: acceptedJobSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 409: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  undoListing: {
    method: "DELETE", path: "/api/v1/restaurants/{slug}/listings/{source}", auth: "owner",
    request: { params: z.strictObject({ slug: z.string().min(1), source: z.enum(LISTING_SOURCES) }) },
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
  startBaselineSpotCheck: {
    method: "POST", path: "/api/v1/baseline-checks/start", auth: "owner",
    request: {},
    responses: { 200: z.strictObject({ started: z.literal(true) }), 401: problemSchema, 403: problemSchema, 409: problemSchema, 500: problemSchema },
  },
  answerBaselineSpotCheck: {
    method: "POST", path: "/api/v1/baseline-checks/answer", auth: "owner",
    request: { body: z.strictObject({ id: z.number().int().positive().safe(), agreed: z.boolean() }) },
    responses: { 200: z.strictObject({ saved: z.literal(true) }), 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema },
  },
  deletePushSubscription: {
    method: "DELETE", path: "/api/v1/push-subscriptions/{id}", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 200: deletePushSubscriptionResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  listInviteLinks: {
    method: "GET", path: "/api/v1/invite-links", auth: "owner",
    request: {},
    responses: { 200: inviteLinkListResponseSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  createInviteLink: {
    method: "POST", path: "/api/v1/invite-links", auth: "owner",
    request: { body: createInviteLinkBodySchema },
    responses: { 201: inviteLinkSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  revokeInviteLink: {
    method: "POST", path: "/api/v1/invite-links/{id}/revoke", auth: "owner",
    request: { params: z.strictObject({ id: z.coerce.number().int().positive().safe() }) },
    responses: { 200: revokeInviteLinkResponseSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  listInvitees: {
    method: "GET", path: "/api/v1/invitees", auth: "owner",
    request: {},
    responses: { 200: inviteeListResponseSchema, 401: problemSchema, 403: problemSchema, 500: problemSchema, 503: problemSchema },
  },
  setInviteeLockOut: {
    method: "PATCH", path: "/api/v1/invitees/{userId}", auth: "owner",
    request: { params: z.strictObject({ userId: z.uuid() }), body: setInviteeLockOutBodySchema },
    responses: { 200: inviteeSchema, 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema, 500: problemSchema, 503: problemSchema },
  },
} as const satisfies Record<string, { method: string; path: string; auth: AuthLevel; [field: string]: unknown }>;

type ResponseSchema = z.ZodType;
export function apiJsonResponse<S extends ResponseSchema>(schema: S, status: number, value: unknown): Response {
  return Response.json(schema.parse(value), {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
