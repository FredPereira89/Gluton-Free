// Per-Review Aspect extraction (Haiku). One request carries ~20 Reviews; each is keyed by its
// review.id so results map back without any ordering assumption. The newest Reviews go through
// the sync path so a Verdict can appear quickly; the rest go through the Batches API at half price.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ASPECTS, CHANGE_MARKERS, FLAG_TYPES, type Aspect, type ChangeMarker, type FlagType } from "@/domain/aspects";
import { THEMES, THEME_CODES, THEME_VOCAB_VERSION, type ThemeCode } from "@/domain/themes";
import type { LlmUsage } from "@/lib/job";
import { addUsage, anthropic, EXTRACT_MODEL } from "./llm";

export const EXTRACTOR_VERSION = `${EXTRACT_MODEL}|extract-v2|${THEME_VOCAB_VERSION}`;
export const CHUNK = 20;

const score = z.number().int().nullable();

const ReviewOut = z.object({
  i: z.number().int(),
  lang: z.string().describe("ISO 639-1 code of the Review's language"),
  food: score,
  service: score,
  ambience: score,
  value: score,
  wait: score,
  consistency: score,
  exceptional: z.enum(["none", "food", "service", "overall"]),
  change: z.enum(CHANGE_MARKERS),
  flags: z.array(
    z.object({
      type: z.enum(FLAG_TYPES),
      first_hand: z.boolean(),
      severity: z.enum(["low", "medium", "high"]),
      evidence: z.string(),
    }),
  ),
  themes: z.array(z.enum(THEME_CODES)),
  quote: z
    .object({
      text: z.string(),
      aspect: z.enum(ASPECTS),
      polarity: z.enum(["positive", "negative"]),
    })
    .nullable(),
  names: z.array(z.string()),
});

const Output = z.object({ reviews: z.array(ReviewOut) });
// The strict schema goes to the model; replies are read leniently, one entry at a time, because the
// model can still return an out-of-vocabulary value and one bad entry must not sink the chunk.
const format = zodOutputFormat(Output);
const isAspect = (v: string): v is Aspect => (ASPECTS as readonly string[]).includes(v);
const isFlagType = (v: string): v is FlagType => (FLAG_TYPES as readonly string[]).includes(v);
const isTheme = (v: string): v is ThemeCode => (THEME_CODES as readonly string[]).includes(v);
const lenientScore = z.number().nullable().catch(null);
const LenientOut = z.object({
  i: z.number(),
  lang: z.string().catch(""),
  food: lenientScore,
  service: lenientScore,
  ambience: lenientScore,
  value: lenientScore,
  wait: lenientScore,
  consistency: lenientScore,
  exceptional: z.enum(["none", "food", "service", "overall"]).catch("none"),
  change: z.enum(CHANGE_MARKERS).catch("none"),
  flags: z.array(z.object({ type: z.string(), first_hand: z.boolean(), severity: z.enum(["low", "medium", "high"]).catch("low"), evidence: z.string() })).catch([]),
  themes: z.array(z.string()).catch([]),
  quote: z.object({ text: z.string(), aspect: z.string(), polarity: z.enum(["positive", "negative"]) }).nullable().catch(null),
  names: z.array(z.string()).catch([]),
});
type LenientEntry = z.infer<typeof LenientOut>;

/** Parses a reply's JSON text into the entries that are usable; malformed entries are left out. */
function parseReply(text: string): LenientEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const reviews = (raw as { reviews?: unknown })?.reviews;
  if (!Array.isArray(reviews)) return [];
  return reviews.flatMap((r) => {
    const p = LenientOut.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

export type ExtractInput = { id: number; text: string; stars: number | null };

export type Extracted = {
  reviewId: number;
  lang: string;
  aspects: Record<Aspect, number | null>;
  exceptional: "none" | "food" | "service" | "overall";
  change: ChangeMarker;
  flags: { type: FlagType; firstHand: boolean; severity: "low" | "medium" | "high"; evidence: string }[];
  themes: ThemeCode[];
  quote: { text: string; aspect: Aspect; polarity: 1 | -1 } | null;
  names: string[];
};

const themeList = Object.entries(THEMES)
  .map(([code, t]) => `- ${code} (${t.aspect}, ${t.polarity > 0 ? "+" : "-"}): ${t.label}; ${t.hint}`)
  .join("\n");

const SYSTEM = `You read restaurant Reviews and extract structured facts about each one. The Reviews are about a single restaurant in Portugal and can be in any language. Judge only what each Review says; never infer from the star rating what the text does not say.

For every Review in the input, return one entry with the same "i".

## Aspect scores

Score each Aspect from the text alone, on this scale:
-2 strongly negative (angry, "terrible", "never again")
-1 negative
0 mixed or lukewarm ("fine", "ok", good and bad in equal measure)
1 positive
2 strongly positive ("the best", "outstanding", "unforgettable")
null when the Review does not speak to that Aspect. Most Reviews leave several Aspects null; do not guess.

- food: taste, cooking, freshness, portions, drinks.
- service: staff warmth, attentiveness, speed of service, mistakes.
- ambience: the room, noise, decor, setting, comfort.
- value: price relative to what was received. A complaint about a surprise or unordered charge is negative value.
- wait: time to get a table (queue, booking) or for food to arrive.
- consistency: only when the reviewer compares visits over time ("we come every year and it is always great", "not what it used to be", "the second visit was worse"). Otherwise null.

## Exceptional

"food", "service" or "overall" only when the reviewer says it is among the best they have ever had (not merely "the best in Lisbon this week"), with the enthusiasm to match. Otherwise "none".

## Change

new_owner, new_chef, renovated, new_concept, or moved only when the Review's own text says this Restaurant itself changed hands, changed its head chef, was renovated, changed concept or menu direction, or moved address. A reviewer merely noting it "used to be better" without naming what changed is not enough. Otherwise none.

## Themes

Up to 3 codes from this list, the ones the Review most clearly states. Use none rather than a stretch.
${themeList}

## Red-flag incidents

Report a flag only for an incident the Review describes, not for general dislike.
- food_poisoning: someone fell ill after eating here.
- hygiene: dirt, pests, spoiled food, unclean kitchen or toilets.
- scam_overcharge: deliberately overcharged, items billed that were not ordered or an uneaten couvert charged, prices different from the menu, pressure to pay more. A pricey couvert that was ordered or eaten is a value complaint, not a Red flag.
- other_safety: injury, violence, theft, serious allergy mishandling.
first_hand is true only when the reviewer or their own party experienced it. severity: low (annoying), medium (real harm or money lost), high (hospital, police, large sums). evidence: the exact words from the Review, at most 200 characters.

## Quote

The single short passage (at most 200 characters) that best captures the Review's main point about one Aspect, copied exactly, character for character, from the Review in its original language. Do not translate, trim words inside it, or fix typos. Null if the Review has nothing quotable.

## Names

Every personal name of a person that appears in the text (staff, owners, the reviewer's companions), exactly as written, so it can be removed. Not dish names, place names, or the restaurant's name. Empty if none.`;

function toUserContent(items: ExtractInput[]): string {
  return items
    .map((r) => `<review i="${r.id}"${r.stars ? ` stars="${r.stars}"` : ""}>\n${r.text}\n</review>`)
    .join("\n");
}

function requestParams(items: ExtractInput[]) {
  return {
    model: EXTRACT_MODEL,
    max_tokens: 8192,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: toUserContent(items) }],
  };
}

const clampScore = (v: number | null): number | null => (v === null ? null : Math.max(-2, Math.min(2, Math.round(v))));
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Validates one model entry against its Review. Drops a quote that is not verbatim. */
function toExtracted(out: LenientEntry, input: ExtractInput): Extracted {
  const aspects = Object.fromEntries(ASPECTS.map((a) => [a, clampScore(out[a])])) as Record<Aspect, number | null>;
  let quote: Extracted["quote"] = null;
  if (out.quote && isAspect(out.quote.aspect)) {
    const q = out.quote.text.trim();
    const verbatim = q.length > 0 && q.length <= 300 && squash(input.text).includes(squash(q));
    if (verbatim) quote = { text: q, aspect: out.quote.aspect, polarity: out.quote.polarity === "positive" ? 1 : -1 };
  }
  return {
    reviewId: input.id,
    lang: out.lang.toLowerCase().slice(0, 8),
    aspects,
    exceptional: out.exceptional,
    change: out.change,
    flags: out.flags.flatMap((f) => (isFlagType(f.type) ? [{ type: f.type, firstHand: f.first_hand, severity: f.severity, evidence: f.evidence.slice(0, 300) }] : [])),
    themes: [...new Set(out.themes.filter(isTheme))].slice(0, 3),
    quote,
    names: out.names.filter((n) => n.trim().length >= 2),
  };
}

function collect(entries: LenientEntry[], items: ExtractInput[], into: Map<number, Extracted>) {
  const byId = new Map(items.map((r) => [r.id, r]));
  for (const out of entries) {
    const input = byId.get(out.i);
    if (input) into.set(input.id, toExtracted(out, input));
  }
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Sync path: a few requests in parallel. Reviews the model skipped or a failed request are absent from the result. */
export async function extractSync(items: ExtractInput[], usage: LlmUsage, concurrency = 4): Promise<Map<number, Extracted>> {
  const result = new Map<number, Extracted>();
  const queue = chunks(items, CHUNK);
  async function worker() {
    for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
      try {
        const res = await anthropic().messages.create({ ...requestParams(chunk), output_config: { format: { type: format.type, schema: format.schema } } });
        addUsage(usage, res.usage);
        const text = res.content.find((c) => c.type === "text");
        if (text && text.type === "text") collect(parseReply(text.text), chunk, result);
      } catch (e) {
        // Left for the retry pass; a persistent failure shows up as unanalysed Reviews.
        console.error(`extract chunk failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}

/** Batch path, step 1: submits every chunk. custom_id carries the chunk index. */
export async function submitBatch(items: ExtractInput[]): Promise<string> {
  const requests = chunks(items, CHUNK).map((chunk, idx) => ({
    custom_id: `c${idx}`,
    params: { ...requestParams(chunk), output_config: { format: { type: format.type, schema: format.schema } } },
  }));
  const batch = await anthropic().messages.batches.create({ requests });
  return batch.id;
}

export async function batchEnded(batchId: string): Promise<boolean> {
  const b = await anthropic().messages.batches.retrieve(batchId);
  return b.processing_status === "ended";
}

/** Batch path, step 2: reads results. Pass the same items, in the same order, as were submitted. */
export async function collectBatch(batchId: string, items: ExtractInput[], usage: LlmUsage): Promise<Map<number, Extracted>> {
  const byChunk = chunks(items, CHUNK);
  const result = new Map<number, Extracted>();
  for await (const r of await anthropic().messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") continue;
    const chunk = byChunk[Number(r.custom_id.slice(1))];
    if (!chunk) continue;
    addUsage(usage, r.result.message.usage);
    const text = r.result.message.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") continue;
    collect(parseReply(text.text), chunk, result); // malformed entries are left out and retried by sync
  }
  return result;
}
