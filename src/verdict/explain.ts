// The explanation and the quotes shown with it (Sonnet). Code computes every number and
// pre-selects quote candidates; the model only chooses among them, translates, and writes
// 2–3 sentences. It never re-decides the Tier.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { INPUT_LABEL, TIER_LABEL, type Aspect } from "@/domain/aspects";
import type { LlmUsage } from "@/lib/job";
import { addUsage, anthropic, JUDGE_MODEL } from "@/analysis/llm";
import type { Rollup } from "./rollup";

export type QuoteCandidate = {
  reviewId: number;
  aspect: Aspect;
  polarity: 1 | -1;
  text: string;
  lang: string | null;
  stars: number | null;
  source: string;
  publishedAt: Date;
  textEn: string | null;
};

export type ShownQuote = {
  reviewId: number;
  aspect: Aspect;
  polarity: 1 | -1;
  text: string;
  textEn: string | null;
  lang: string | null;
  stars: number | null;
  source: string;
  month: string; // YYYY-MM
};

/** Per Aspect, the newest few positive and negative quotes of a readable length. */
export function preselect(all: QuoteCandidate[], perAspect = { pos: 3, neg: 2 }): QuoteCandidate[] {
  const readable = all.filter((q) => q.text.length >= 30 && q.text.length <= 240);
  const newestFirst = [...readable].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const out: QuoteCandidate[] = [];
  for (const aspect of ["food", "service", "value", "wait", "consistency", "ambience"] as Aspect[]) {
    out.push(...newestFirst.filter((q) => q.aspect === aspect && q.polarity === 1).slice(0, perAspect.pos));
    out.push(...newestFirst.filter((q) => q.aspect === aspect && q.polarity === -1).slice(0, perAspect.neg));
  }
  return out;
}

const Out = z.object({
  explanation: z.string(),
  quotes: z.array(
    z.object({
      id: z.number().int(),
      translation_en: z.string().nullable().describe("English translation, or null if the quote is already in English"),
    }),
  ),
});
const format = zodOutputFormat(Out);

const fmt = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

function facts(name: string, formatName: string, r: Rollup): string {
  const lines: string[] = [];
  lines.push(`Restaurant: ${name} (Format: ${formatName})`);
  if (r.state === "not_enough_evidence") {
    lines.push(`State: Not enough evidence. Bars missed: ${r.notEnoughEvidence.missed.join("; ")}.`);
  } else {
    lines.push(`Tier: ${TIER_LABEL[r.tier!]}`);
  }
  lines.push(`Provisional: yes. Judged against default cut-offs on the −2..+2 Review scale, not against Peers (other ${formatName}s have not been gathered yet). Life Changing is not available while provisional.`);
  lines.push(`Composite: ${fmt(r.composite)} (Good from +0.80, Must Go from +1.30)`);
  lines.push("Inputs (θ on −2..+2, weight in the composite, effective number of Reviews):");
  for (const s of r.inputs) {
    lines.push(`- ${INPUT_LABEL[s.input]}: θ ${fmt(s.theta)}, ${s.counted ? `weight ${Math.round(s.weight * 100)}%` : `not counted at a ${formatName}`}, n_eff ${s.nEff.toFixed(0)}`);
  }
  lines.push(`Largest contributions to the composite: ${r.contributions.slice(0, 3).map((c) => `${INPUT_LABEL[c.input]} ${fmt(c.value)}`).join(", ")}`);
  if (r.floorCap) lines.push(`Floor that capped the Tier: ${r.floorCap}`);
  if (r.redFlags.length) {
    for (const g of r.redFlags) {
      lines.push(`Red flag (${g.group}): ${g.incidents12m} confirmed first-hand incident(s) in the last 12 months, newest ${g.newestAt?.slice(0, 7)}, types ${g.types.join(", ")}; ${g.forcesAvoid ? "3 or more within the last 3 months forces Avoid" : "shown, does not move the Tier"}.`);
    }
  } else {
    lines.push("Red flags: none confirmed in the last 12 months.");
  }
  lines.push(`Confidence: ${r.confidence.level}. Reasons: ${r.confidence.caps.join("; ")}. Tier reproduced in ${Math.round(r.confidence.bootstrapShare * 100)}% of bootstrap resamples.`);
  lines.push(`Reviews: ${r.counts.reviews} (${r.counts.textReviews} with text) from ${Object.keys(r.counts.perSource).join(" and ")}.`);
  return lines.join("\n");
}

export async function explainAndQuote(
  args: { name: string; formatName: string; rollup: Rollup; candidates: QuoteCandidate[] },
  usage: LlmUsage,
): Promise<{ explanation: string; quotes: ShownQuote[] }> {
  const { rollup: r, candidates } = args;
  const list = candidates
    .map((q, id) => `[${id}] ${q.aspect} ${q.polarity > 0 ? "positive" : "negative"} · ${q.lang ?? "?"} · ${q.stars ?? "-"}★ · ${q.publishedAt.toISOString().slice(0, 7)}\n${q.text}`)
    .join("\n\n");
  const res = await anthropic().messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 4096,
    output_config: { effort: "low", format },
    messages: [
      {
        role: "user",
        content: `You write the explanation on a restaurant's Verdict page, from computed facts. Never change or re-decide the Tier; never add facts that are not below.

<facts>
${facts(args.name, args.formatName, r)}
</facts>

Write 2–3 plain sentences, no bullet points, no markdown except wrapping the Tier name in **bold** once. They must state, in this order:
1. the Tier, and that it is provisional: judged against default cut-offs rather than other ${args.formatName}s;
2. the one or two inputs that decided it (use their θ values, e.g. "food (θ +1.21)"), or the floor that capped it;
3. any Red flag: its group, how many incidents, how recent (skip if none);
4. the Confidence level and its main reason.
For Not enough evidence, say which bar was missed instead of 1–2.
Do not mention Distinctions, critics, or star averages from Sources.

Then choose 4–6 quotes from the candidates below for an "In their words" section. Together they should reflect the balance of the facts: mostly quotes for the inputs that decided the Tier, and at least one criticism if any input is weak or a notable share of Reviews complain. Prefer concrete, specific quotes over generic praise, and at most two per Aspect. For each chosen quote give its id and an English translation (null if it is already English). Translate faithfully, keeping the tone.

<candidates>
${list}
</candidates>`,
      },
    ],
  });
  addUsage(usage, res.usage);
  const out = res.parsed_output;
  if (!out) throw new Error(`explanation: no parsed output (stop_reason ${res.stop_reason})`);
  const seen = new Set<number>();
  const quotes: ShownQuote[] = [];
  for (const q of out.quotes) {
    const c = candidates[q.id];
    if (!c || seen.has(q.id)) continue;
    seen.add(q.id);
    const isEnglish = (c.lang ?? "").startsWith("en");
    quotes.push({
      reviewId: c.reviewId,
      aspect: c.aspect,
      polarity: c.polarity,
      text: c.text,
      textEn: isEnglish ? null : (c.textEn ?? q.translation_en),
      lang: c.lang,
      stars: c.stars,
      source: c.source,
      month: c.publishedAt.toISOString().slice(0, 7),
    });
  }
  return { explanation: out.explanation.trim(), quotes };
}
