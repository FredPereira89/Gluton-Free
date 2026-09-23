// The shape of verdict.blocks. Validated on write and on read, so the page never renders a
// half-formed Verdict.
import { z } from "zod";
import { ASPECTS, FLAG_TYPES, INPUTS, TIERS } from "@/domain/aspects";
import { THEME_CODES } from "@/domain/themes";

const inputStat = z.object({
  input: z.enum(INPUTS),
  counted: z.boolean(),
  weight: z.number(),
  theta: z.number(),
  nEff: z.number(),
  n: z.number(),
  sumW: z.number(),
});

export const RollupSchema = z.object({
  ruleVersion: z.string(),
  provisional: z.literal(true),
  state: z.enum(["verdict", "not_enough_evidence"]),
  tier: z.enum(TIERS).nullable(),
  composite: z.number(),
  inputs: z.array(inputStat),
  contributions: z.array(z.object({ input: z.enum(INPUTS), value: z.number() })),
  floorCap: z.string().nullable(),
  notEnoughEvidence: z.object({
    textReviews: z.number(),
    foodMentions: z.number(),
    newestAgeMonths: z.number().nullable(),
    missed: z.array(z.string()),
  }),
  redFlags: z.array(
    z.object({
      group: z.enum(["health", "money"]),
      incidents12m: z.number(),
      newestAt: z.string().nullable(),
      shareOfText12m: z.number(),
      forcesAvoid: z.boolean(),
      types: z.array(z.enum(FLAG_TYPES)),
    }),
  ),
  confidence: z.object({ level: z.enum(["low", "medium", "high"]), bootstrapShare: z.number(), caps: z.array(z.string()) }),
  consistencySpread: z.object({ sd: z.number().nullable(), n: z.number(), windowMonths: z.number() }),
  counts: z.object({
    reviews: z.number(),
    textReviews: z.number(),
    ratingOnly: z.number(),
    analysed: z.number(),
    perSource: z.record(z.string(), z.object({ reviews: z.number(), text: z.number(), newest: z.string().nullable() })),
  }),
  themes: z.array(
    z.object({
      code: z.enum(THEME_CODES),
      aspect: z.enum(ASPECTS),
      polarity: z.union([z.literal(1), z.literal(-1)]),
      count: z.number(),
      share: z.number(),
    }),
  ),
  themeBase: z.object({ analysed: z.number(), windowMonths: z.number() }),
  series: z.array(z.object({ quarter: z.string(), composite: z.number().nullable(), volume: z.number(), textVolume: z.number() })),
});

export const ShownQuoteSchema = z.object({
  reviewId: z.number(),
  aspect: z.enum(ASPECTS),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  text: z.string(),
  textEn: z.string().nullable(),
  lang: z.string().nullable(),
  stars: z.number().nullable(),
  source: z.string(),
  month: z.string(),
});

export const BlocksSchema = z.object({
  rollup: RollupSchema,
  quotes: z.array(ShownQuoteSchema),
});
export type Blocks = z.infer<typeof BlocksSchema>;
