// The PII whitelist. Vendor payloads are parsed with zod object schemas, which strip every
// key not named here, so reviewer names, avatars, profile URLs and permalinks never leave
// this module. Owner responses become a boolean. Nothing here is logged.
import { z } from "zod";
import type { Aspect } from "@/domain/aspects";
import { scrubText } from "./scrub";

export type NormalisedReview = {
  sourceReviewId: string;
  stars: number | null;
  publishedAt: Date;
  language: string | null;
  text: string | null;
  subRatings: Partial<Record<Aspect, number>> | null;
  reviewerReviewCount: number | null;
  localGuide: boolean | null;
  reviewerContributions: number | null;
  photoCount: number | null;
  visitedOn: string | null;
  ownerReplied: boolean;
};

export type ListingFacts = {
  title: string | null;
  address: string | null;
  placeRef: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
};

export type Normalised = { facts: ListingFacts; reviews: NormalisedReview[]; droppedThirdParty: number };

const num = z.number().nullish();
const str = z.string().nullish();
const rating = z.object({ value: num }).nullish();
const highlight = z.object({ feature: str, assessment: z.union([z.string(), z.number()]).nullish() });

// Sub-rating features we keep, by Source feature name (lower-cased).
const FEATURE_ASPECT: Record<string, Aspect> = {
  food: "food",
  service: "service",
  atmosphere: "ambience",
  value: "value",
};

function subRatings(list: z.infer<typeof highlight>[] | null | undefined): Partial<Record<Aspect, number>> | null {
  const out: Partial<Record<Aspect, number>> = {};
  for (const h of list ?? []) {
    const aspect = FEATURE_ASPECT[(h.feature ?? "").trim().toLowerCase()];
    const n = typeof h.assessment === "number" ? h.assessment : Number(h.assessment);
    if (aspect && Number.isInteger(n) && n >= 1 && n <= 5) out[aspect] = n;
  }
  return Object.keys(out).length ? out : null;
}

function clean(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t ? scrubText(t) : null;
}

function stars(v: number | null | undefined): number | null {
  return typeof v === "number" && v >= 1 && v <= 5 ? Math.round(v) : null;
}

function date(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.replace(" +00:00", "Z").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

const googleItem = z.object({
  type: str,
  review_id: str,
  review_text: str,
  original_review_text: str,
  original_language: str,
  language: str,
  timestamp: str,
  rating,
  review_highlights: z.array(highlight).nullish(),
  reviews_count: num,
  photos_count: num,
  local_guide: z.boolean().nullish(),
  owner_answer: str,
  original_owner_answer: str,
  // Used only to recognise Reviews Google mixed in from other sites; never stored.
  review_url: str,
  source: str,
});

const googleResult = z.object({
  title: str,
  sub_title: str,
  place_id: str,
  reviews_count: num,
  rating,
  price_level: str,
  items: z.array(googleItem).nullish(),
});

function isGoogleOrigin(item: z.infer<typeof googleItem>): boolean {
  if (item.type && item.type !== "google_reviews_search") return false;
  if (item.source && !/google/i.test(item.source)) return false;
  if (item.review_url && !/google\./i.test(item.review_url)) return false;
  // Numeric Review IDs are used by Tripadvisor, not Google's opaque Review IDs.
  if (item.review_id && /^\d+$/.test(item.review_id)) return false;
  return true;
}

export function normaliseGoogle(raw: unknown): Normalised {
  const r = googleResult.parse(raw);
  let droppedThirdParty = 0;
  const reviews: NormalisedReview[] = [];
  for (const it of r.items ?? []) {
    if (!isGoogleOrigin(it)) {
      droppedThirdParty++;
      continue;
    }
    const publishedAt = date(it.timestamp);
    if (!it.review_id || !publishedAt) continue;
    reviews.push({
      sourceReviewId: it.review_id,
      stars: stars(it.rating?.value),
      publishedAt,
      language: it.original_language ?? it.language ?? null,
      text: clean(it.original_review_text ?? it.review_text),
      subRatings: subRatings(it.review_highlights),
      reviewerReviewCount: it.reviews_count ?? null,
      localGuide: it.local_guide ?? null,
      reviewerContributions: null,
      photoCount: it.photos_count ?? null,
      visitedOn: null,
      ownerReplied: Boolean(it.owner_answer || it.original_owner_answer),
    });
  }
  return {
    facts: {
      title: r.title ?? null,
      address: r.sub_title ?? null,
      placeRef: r.place_id ?? null,
      rating: r.rating?.value ?? null,
      reviewCount: r.reviews_count ?? null,
      priceLevel: r.price_level ?? null,
    },
    reviews,
    droppedThirdParty,
  };
}

const taItem = z.object({
  review_id: str,
  title: str,
  review_text: str,
  original_language: str,
  language: str,
  date_of_visit: str,
  timestamp: str,
  rating,
  review_highlights: z.array(highlight).nullish(),
  user_profile: z.object({ reviews_count: num }).nullish(),
  responses: z.array(z.unknown()).nullish(),
});

const taResult = z.object({
  title: str,
  url_path: str,
  location: str,
  reviews_count: num,
  rating,
  price_level: str,
  items: z.array(taItem).nullish(),
});

export function normaliseTripadvisor(raw: unknown): Normalised {
  const r = taResult.parse(raw);
  const reviews: NormalisedReview[] = [];
  for (const it of r.items ?? []) {
    const publishedAt = date(it.timestamp);
    if (!it.review_id || !publishedAt) continue;
    const body = [it.title?.trim(), it.review_text?.trim()].filter(Boolean).join("\n\n");
    const visited = date(it.date_of_visit);
    reviews.push({
      sourceReviewId: it.review_id,
      stars: stars(it.rating?.value),
      publishedAt,
      language: it.original_language ?? it.language ?? null,
      text: clean(body),
      subRatings: subRatings(it.review_highlights),
      reviewerReviewCount: null,
      localGuide: null,
      reviewerContributions: it.user_profile?.reviews_count ?? null,
      photoCount: null,
      visitedOn: visited ? visited.toISOString().slice(0, 10) : null,
      ownerReplied: (it.responses?.length ?? 0) > 0,
    });
  }
  return {
    facts: {
      title: r.title ?? null,
      address: r.location ?? null,
      placeRef: r.url_path ?? null,
      rating: r.rating?.value ?? null,
      reviewCount: r.reviews_count ?? null,
      priceLevel: r.price_level ?? null,
    },
    reviews,
    droppedThirdParty: 0,
  };
}
