// Code computes every number and preselects the quotes. Sonnet writes only the
// explanation and never re-decides the Tier.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { INPUT_LABEL, TIER_LABEL, type Aspect } from "@/domain/aspects";
import type { LlmUsage } from "@/lib/job";
import { addUsage, anthropic, JUDGE_MODEL } from "@/analysis/llm";
import { formatPercentile } from "./peer";
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
  access?: "public_ok" | "personal_only";
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
  access?: "public_ok" | "personal_only";
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

export function shownQuotes(candidates: QuoteCandidate[]): ShownQuote[] {
  return candidates.map((q) => ({
    reviewId: q.reviewId, aspect: q.aspect, polarity: q.polarity, text: q.text,
    textEn: q.lang?.startsWith("en") ? null : q.textEn,
    lang: q.lang, stars: q.stars, source: q.source, access: q.access,
    month: q.publishedAt.toISOString().slice(0, 7),
  }));
}

const Out = z.object({
  explanation: z.string(),
});
const format = zodOutputFormat(Out);

const fmt = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

export function explanationFacts(name: string, formatName: string, r: Rollup): string {
  const lines: string[] = [];
  lines.push(`Restaurant: ${name} (Format: ${formatName})`);
  if (r.state === "not_enough_evidence") {
    lines.push(`State: Not enough evidence. Bars missed: ${r.notEnoughEvidence.missed.join("; ")}.`);
  } else {
    lines.push(`Tier: ${TIER_LABEL[r.tier!]}`);
  }
  lines.push(r.provisional
    ? `Provisional: yes. Judged against default cut-offs on the −2..+2 Review scale, not against Peers (other ${formatName}s have not been gathered yet). Life Changing is not available while provisional.`
    : `Provisional: no. Ranked against Peer snapshot #${r.peerSnapshot!.id} (${r.peerSnapshot!.month}). Per-input Peer levels: ${r.standings?.map((s) => `${INPUT_LABEL[s.input]} ${s.level} ${s.key} (${s.peerCount} Peers, ${formatPercentile(s.percentile)})`).join("; ")}. Composite stands at ${formatPercentile(r.compositeStanding!.percentile)} among Peer composites (Avoid below P10 with a negative θ on food or Overall, OK P10–P45, Good P45–P85, Must Go P85 and up, Life Changing at P98 and up with food also at P98, at least 50 Peers at the level used, no verified Red flag in the last 12 months, and the exceptional-language test).`);
  lines.push(`Composite: ${fmt(r.composite)} on the −2..+2 scale${r.provisional ? " (Good from +0.80, Must Go from +1.30)" : ""}`);
  lines.push("Inputs (θ on −2..+2, weight in the composite, effective number of Reviews):");
  for (const s of r.inputs) {
    lines.push(`- ${INPUT_LABEL[s.input]}: θ ${fmt(s.theta)}, ${s.counted ? `weight ${Math.round(s.weight * 100)}%` : `not counted at a ${formatName}`}, n_eff ${s.nEff.toFixed(0)}`);
  }
  lines.push(`Largest contributions to the composite: ${r.contributions.slice(0, 3).map((c) => `${INPUT_LABEL[c.input]} ${fmt(c.value)}`).join(", ")}`);
  if (r.floorCap) lines.push(`Floor that capped the Tier: ${r.floorCap}`);
  if (r.ceilingNote) lines.push(`What stands between this Restaurant and Life Changing: ${r.ceilingNote}`);
  if (r.tierHeld) lines.push("Tier stability: this automatic re-judgement would have changed the Tier, but the composite or floor has not clearly crossed its threshold, so the previous Tier remains.");
  if (r.redFlags.length) {
    for (const g of r.redFlags) {
      lines.push(`Red flag (${g.group}): ${g.incidents12m} confirmed first-hand incident(s) in the last 12 months, newest ${g.newestAt?.slice(0, 7)}, types ${g.types.join(", ")}; ${g.forcesAvoid ? "recurring and recent incidents force Avoid" : "shown, does not move the Tier and blocks Life Changing"}.`);
    }
  } else {
    lines.push("Red flags: none confirmed in the last 12 months.");
  }
  lines.push(`Confidence: ${r.confidence.level}. Reasons: ${r.confidence.caps.join("; ")}. Tier reproduced in ${Math.round(r.confidence.bootstrapShare * 100)}% of bootstrap resamples.`);
  lines.push(`Reviews: ${r.counts.reviews} (${r.counts.textReviews} with text) from ${Object.keys(r.counts.perSource).join(" and ")}.`);
  return lines.join("\n");
}

function comparison(level: "format" | "family" | "city", key: string, formatName: string): string {
  if (level === "format") return `Format ${formatName} Peers`;
  if (level === "family") return `Format family ${key.replaceAll("_", " ")} Peers`;
  return `all ${key} Peers`;
}

function explanationPasses(explanation: string, formatName: string, r: Rollup): boolean {
  const text = explanation.replaceAll("**", "").toLowerCase();
  if (r.state === "verdict") {
    if (!explanation.toLowerCase().includes(`**${TIER_LABEL[r.tier!].toLowerCase()}**`)) return false;
    const deciding = r.contributions.slice(0, 2).map((c) => INPUT_LABEL[c.input].toLowerCase());
    if (r.floorCap ? !text.includes(r.floorCap.toLowerCase()) : !deciding.some((input) => text.includes(input))) return false;
  } else if (!text.includes("not enough evidence") || !r.notEnoughEvidence.missed.some((bar) => text.includes(bar.toLowerCase()))) {
    return false;
  }
  if (!new RegExp(`\\bconfidence\\s*(?::|is)?\\s*${r.confidence.level}\\b`, "i").test(text)) return false;
  if (r.provisional) {
    if (!text.includes("provisional")) return false;
  } else if (text.includes("provisional") && !text.includes("not provisional")) {
    return false;
  } else {
    const levels = new Set<string>();
    if (r.compositeStanding) levels.add(comparison(r.compositeStanding.level, r.compositeStanding.key, formatName).toLowerCase());
    const deciding = r.floorCap ? [] : r.contributions.slice(0, 2).map((c) => c.input);
    for (const standing of r.standings ?? []) {
      if (deciding.includes(standing.input)) levels.add(comparison(standing.level, standing.key, formatName).toLowerCase());
    }
    if ([...levels].some((level) => !text.includes(level))) return false;
  }
  if (r.redFlags.some((flag) => {
    const groupClause = text.split(/[.!?;]/).find((clause) => clause.includes(flag.group));
    const count = new RegExp(`\\b${flag.incidents12m}\\s+(?:verified\\s+)?(?:first-hand\\s+)?(?:incidents?|reports?)\\b`);
    return !groupClause || !count.test(groupClause) || (flag.newestAt && !groupClause.includes(flag.newestAt.slice(0, 7)));
  })) return false;
  if (r.tierHeld && !/\b(held|remains|retained)\b/.test(text)) return false;
  return !/\b(distinctions?|critics?|michelin|repsol)\b/i.test(text);
}

function templateExplanation(formatName: string, r: Rollup): string {
  const peer = r.provisional
    ? `provisional, judged against default cut-offs for Format ${formatName}`
    : `compared with ${comparison(r.compositeStanding!.level, r.compositeStanding!.key, formatName)} at ${formatPercentile(r.compositeStanding!.percentile)}`;
  const first = r.state === "not_enough_evidence"
    ? `Not enough evidence: ${r.notEnoughEvidence.missed.join("; ")}; ${peer}.`
    : `**${TIER_LABEL[r.tier!]}** is ${peer}.`;
  const deciding = r.state === "not_enough_evidence" || r.redFlags.some((flag) => flag.forcesAvoid) ? "" : r.floorCap
    ? `The floor capped the Tier: ${r.floorCap}`
    : `The deciding inputs were ${r.contributions.slice(0, 2).map(({ input }) => {
      const stat = r.inputs.find((s) => s.input === input)!;
      const standing = r.standings?.find((s) => s.input === input);
      return `${INPUT_LABEL[input]} (θ ${fmt(stat.theta)}${standing ? `, ${comparison(standing.level, standing.key, formatName)} ${formatPercentile(standing.percentile)}` : ""})`;
    }).join(" and ")}`;
  const flags = r.redFlags.map((flag) =>
      `${flag.group} Red flag: ${flag.incidents12m} verified incident${flag.incidents12m === 1 ? "" : "s"} in the last 12 months, newest ${flag.newestAt?.slice(0, 7) ?? "date unknown"}${flag.forcesAvoid ? ", which forces Avoid" : ""}`,
  );
  const second = [deciding, ...(r.tierHeld ? ["the previous Tier was held by the stability margin"] : []), ...flags].filter(Boolean).join("; ");
  const reason = (r.provisional && "provisional: judged against default cut-offs, not Peers") ||
    r.confidence.caps.find((cap) => cap.startsWith("a Crowd Source failed")) ||
    r.confidence.caps[0] ||
    `Tier reproduced in ${Math.round(r.confidence.bootstrapShare * 100)}% of bootstrap resamples`;
  const third = `Confidence: ${r.confidence.level === "high" ? "High" : r.confidence.level === "medium" ? "Medium" : "Low"}${r.confidence.level === "high" ? "" : ` because ${reason}`}.`;
  return [first, second ? `${second}.` : "", third].filter(Boolean).join(" ");
}

export async function explainAndQuote(
  args: { name: string; formatName: string; rollup: Rollup; candidates: QuoteCandidate[] },
  usage: LlmUsage,
): Promise<{ explanation: string; quotes: ShownQuote[] }> {
  const { rollup: r } = args;
  const request = {
    model: JUDGE_MODEL,
    max_tokens: 4096,
    output_config: { effort: "low" as const, format },
    messages: [
      {
        role: "user" as const,
        content: `You write the explanation on a restaurant's Verdict page, from computed facts. Never change or re-decide the Tier; never add facts that are not below.

<facts>
${explanationFacts(args.name, args.formatName, r)}
</facts>

Write 2–3 plain sentences, no bullet points, no markdown except wrapping the Tier name in **bold** once. They must state, in this order:
1. the Tier and whether it is provisional or ranked against Peers; when a Peer snapshot exists, name it, the levels used for the deciding inputs' standings, and the composite's Peer percentile;
2. the one or two inputs that decided it (use their θ values, e.g. "food (θ +1.21)"), or the floor that capped it; when Tier stability held the previous Tier, say so;
3. any Red flag: its group, how many incidents, how recent (skip if none);
4. the Confidence level and its main reason.
For Not enough evidence, say which bar was missed instead of 1–2.
Do not mention Distinctions, critics, or star averages from Sources.
`,
      },
    ],
  };
  let out: z.infer<typeof Out> | null = null;
  let explanation = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.parse(attempt === 0 ? request : {
      ...request,
      messages: [...request.messages, { role: "user" as const, content: "The previous explanation missed a required computed fact. Regenerate it with the exact bold Tier (or Not enough evidence and its missed bar), the deciding input or floor, the comparison level from the facts, every Red flag group with its exact count and newest month, Confidence, and whether it is provisional. Use only the facts above." }],
    });
    addUsage(usage, res.usage);
    out = res.parsed_output;
    if (!out) throw new Error(`explanation: no parsed output (stop_reason ${res.stop_reason})`);
    explanation = out.explanation.trim();
    if (explanationPasses(explanation, args.formatName, r)) break;
    if (attempt === 1) explanation = templateExplanation(args.formatName, r);
  }
  return { explanation, quotes: shownQuotes(args.candidates) };
}
