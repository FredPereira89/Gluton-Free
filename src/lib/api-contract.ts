import { z } from "zod";
import { TIERS } from "@/domain/aspects";
import { BlocksSchema, RollupSchema } from "@/verdict/blocks";
import { problemSchema } from "./problem";

const restaurantSchema = z.strictObject({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  area: z.string().nullable(),
  format: z.string(),
  priceTier: z.enum(["€", "€€", "€€€", "€€€€"]).nullable(),
});

const verdictSchema = z.strictObject({
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  explanation: z.string().nullable(),
  issuedAt: z.iso.datetime(),
  provisional: z.literal(true),
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
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  textCount: z.number().int().nullable(),
  newestAt: z.iso.datetime().nullable(),
  fetchStatus: z.enum(["not_fetched", "fetching", "fetched", "failed"]),
});

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
    blocks: BlocksSchema,
  }).nullable(),
  sources: z.array(bundleSourceSchema),
  distinctions: z.array(z.strictObject({ guide: z.string(), level: z.string(), editionYear: z.number().int().nullable(), url: z.url() })),
  critics: z.array(z.strictObject({ publication: z.string(), title: z.string(), url: z.url(), publishedOn: z.string().nullable() })),
  series: RollupSchema.shape.series,
  changePoints: z.array(z.strictObject({ occurredOn: z.string(), description: z.string() })),
  activeJob: z.strictObject({ id: z.number().int(), kind: z.enum(["lookup", "refresh", "baseline", "snapshot"]), status: z.enum(["queued", "running"]), step: z.string().nullable(), createdAt: z.iso.datetime() }).nullable(),
  ownerQuestions: z.array(z.strictObject({ id: z.number().int(), prompt: z.string() })),
});
export type RestaurantBundle = z.infer<typeof restaurantBundleSchema>;

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
  return paginationQuerySchema.parse({ cursor, limit });
}

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const acceptedJobSchema = z.strictObject({ id: z.number().int().positive() });

export function acceptedJobResponse(id: number): Response {
  const body = acceptedJobSchema.parse({ id });
  return Response.json(body, {
    status: 202,
    headers: { Location: `/api/v1/jobs/${id}`, "Retry-After": "5", "Cache-Control": "private, no-store" },
  });
}

export const routes = {
  health: {
    method: "GET",
    path: "/api/v1/health",
    auth: "none",
    request: {},
    responses: { 200: healthResponseSchema, 500: problemSchema },
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
} as const;

type ResponseSchema = z.ZodType;
export function apiJsonResponse<S extends ResponseSchema>(schema: S, status: number, value: unknown): Response {
  return Response.json(schema.parse(value), {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
