// The shape of verdict.blocks. Validated on write and on read, so the page never renders a
// half-formed Verdict.
import { z } from "zod";
import { ASPECTS, FLAG_TYPES, INPUTS, TIERS } from "@/domain/aspects";
import { THEME_CODES } from "@/domain/themes";

const inputStat = z.strictObject({
  input: z.enum(INPUTS),
  counted: z.boolean(),
  weight: z.number(),
  theta: z.number(),
  nEff: z.number(),
  n: z.number(),
  sumW: z.number(),
});

export const RollupSchema = z.strictObject({
  ruleVersion: z.string(),
  provisional: z.boolean(),
  peerSnapshot: z.strictObject({ id: z.number().int(), month: z.string(), publishedAt: z.iso.datetime() }).nullable().optional(),
  standings: z.array(z.strictObject({ input: z.enum(INPUTS), theta: z.number(), percentile: z.number(), level: z.enum(["format", "family", "city"]), key: z.string(), peerCount: z.number().int() })).optional(),
  compositeStanding: z.strictObject({ percentile: z.number(), level: z.enum(["format", "family", "city"]), key: z.string(), peerCount: z.number().int() }).nullable().optional(),
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  tierChange: z.strictObject({ from: z.enum(TIERS), at: z.iso.datetime() }).optional(),
  tierBasis: z.strictObject({
    composite: z.number(),
    standings: z.array(z.strictObject({ input: z.enum(INPUTS), percentile: z.number() })),
  }).optional(),
  tierHeld: z.boolean().optional(),
  composite: z.number(),
  inputs: z.array(inputStat),
  contributions: z.array(z.strictObject({ input: z.enum(INPUTS), value: z.number() })),
  floorCap: z.string().nullable(),
  tierFloors: z.array(z.strictObject({ input: z.enum(INPUTS), percentile: z.number() })).optional(),
  // Optional so Verdicts issued before Life Changing's ceiling note (issue #36) remain readable.
  ceilingNote: z.string().nullable().optional(),
  notEnoughEvidence: z.strictObject({
    textReviews: z.number(),
    foodMentions: z.number(),
    newestAgeMonths: z.number().nullable(),
    missed: z.array(z.string()),
    // Optional so Verdicts issued before these bars were recorded remain readable.
    bars: z.strictObject({
      textReviews: z.strictObject({ have: z.number(), need: z.number(), met: z.boolean() }),
      foodMentions: z.strictObject({ have: z.number(), need: z.number(), met: z.boolean() }),
      newestReview: z.strictObject({ have: z.number().nullable(), need: z.number(), met: z.boolean() }),
    }).optional(),
    reasonLine: z.string().nullable().optional(),
  }),
  redFlags: z.array(
    z.strictObject({
      group: z.enum(["health", "money"]),
      incidents12m: z.number(),
      newestAt: z.string().nullable(),
      shareOfText12m: z.number(),
      forcesAvoid: z.boolean(),
      types: z.array(z.enum(FLAG_TYPES)),
      // Optional so Verdicts issued before incident evidence was stored remain readable.
      incidents: z.array(z.strictObject({
        reviewId: z.number().int(), type: z.enum(FLAG_TYPES), evidence: z.string(),
        source: z.string(), publishedAt: z.iso.datetime(), stars: z.number().nullable().optional(),
      })).optional(),
    }),
  ),
  confidence: z.strictObject({ level: z.enum(["low", "medium", "high"]), bootstrapShare: z.number(), caps: z.array(z.string()) }),
  consistencySpread: z.strictObject({ sd: z.number().nullable(), n: z.number(), windowMonths: z.number() }),
  counts: z.strictObject({
    reviews: z.number(),
    textReviews: z.number(),
    ratingOnly: z.number(),
    analysed: z.number(),
    perSource: z.record(
      z.string(),
      z.strictObject({ reviews: z.number(), text: z.number(), newest: z.string().nullable(), windowStart: z.string().nullable() }),
    ),
  }),
  themes: z.array(
    z.strictObject({
      code: z.enum(THEME_CODES),
      aspect: z.enum(ASPECTS),
      polarity: z.union([z.literal(1), z.literal(-1)]),
      count: z.number(),
      share: z.number(),
    }),
  ),
  themeBase: z.strictObject({ analysed: z.number(), windowMonths: z.number() }),
  series: z.array(z.strictObject({
    quarter: z.string(),
    composite: z.number().nullable(),
    // Optional so Verdicts issued before the composite layer (issue #41) remain readable.
    compositePercentile: z.number().nullable().optional(),
    enoughReviews: z.boolean().optional(),
    volume: z.number(),
    textVolume: z.number(),
  })),
  // Optional for Verdicts issued before full Source history was recorded.
  sourceHistory: z.array(z.strictObject({
    source: z.string(),
    quarters: z.array(z.strictObject({ quarter: z.string(), stars: z.number().nullable(), ratings: z.number().int(), volume: z.number().int() })),
  })).optional(),
  // Optional for Verdicts issued before per-Source Tier readings were recorded (issue #38).
  sourceReadings: z.array(z.strictObject({
    source: z.string(),
    tier: z.enum(TIERS).nullable(),
    textReviews12m: z.number(),
    quiet: z.boolean(),
  })).optional(),
  // Optional so Verdicts issued before Change points were surfaced (issue #41; storage lands in #58) remain readable.
  changePointAt: z.iso.datetime().nullable().optional(),
  changePointDescription: z.string().optional(),
  // Optional so Verdicts issued before the disagreement line (issue #41) remain readable.
  disagreement: z.strictObject({
    sources: z.array(z.strictObject({ source: z.string(), tier: z.enum(TIERS) })),
    since: z.iso.datetime(),
    textReviews: z.number(),
  }).nullable().optional(),
});

export const ShownQuoteSchema = z.strictObject({
  reviewId: z.number(),
  aspect: z.enum(ASPECTS),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  text: z.string(),
  textEn: z.string().nullable(),
  lang: z.string().nullable(),
  stars: z.number().nullable(),
  source: z.string(),
  month: z.string(),
  access: z.enum(["public_ok", "personal_only"]).optional(),
});

export const BlocksSchema = z.strictObject({
  rollup: RollupSchema,
  quotes: z.array(ShownQuoteSchema),
});
export type Blocks = z.infer<typeof BlocksSchema>;
