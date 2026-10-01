// Plain-language copy for the decision-first report (#112). Everything here is derived from the
// computed Rollup and is safe to show an Invitee: no θ, percentile numbers, SD or Peer-snapshot
// language. Anything this module does not know how to say plainly is left out, never passed through.
import type { z } from "zod";
import { INPUT_LABEL, type FlagType, type Input } from "@/domain/aspects";
import { familyPlural, formatPlural } from "@/domain/format-labels";
import { THEMES } from "@/domain/themes";
import type { RollupSchema } from "./blocks";
import { PARAMS } from "./rollup";

// Owner and Invitee Rollups differ only in what a red flag's incidents carry, which nothing here reads.
type FullRollup = z.infer<typeof RollupSchema>;
type Rollup = Omit<FullRollup, "redFlags"> & { redFlags: (Omit<FullRollup["redFlags"][number], "incidents"> & { incidents?: unknown })[] };
type Group = { level: "format" | "family" | "city"; key: string };
export type ReportContext = { format: string; city: string };
type RedFlag = Pick<Rollup["redFlags"][number], "incidents12m" | "types">;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How a percentile among Peers reads in words. */
export function standingPhrase(percentile: number): string {
  if (percentile >= 90) return "better than almost all";
  if (percentile >= 65) return "better than most";
  if (percentile >= 35) return "about typical for";
  if (percentile >= 10) return "weaker than most";
  return "weaker than almost all";
}

/** The same five buckets as standingPhrase, as 1 (weakest) to 5 (best), for a meter that shows no number. */
export function standingLevel(percentile: number): 1 | 2 | 3 | 4 | 5 {
  if (percentile >= 90) return 5;
  if (percentile >= 65) return 4;
  if (percentile >= 35) return 3;
  if (percentile >= 10) return 2;
  return 1;
}

export function peerGroupName(group: Group, ctx: ReportContext): string {
  if (group.level === "format") return `${formatPlural(group.key)} in ${ctx.city}`;
  if (group.level === "family") return `${familyPlural(group.key)} in ${ctx.city}`;
  return `restaurants in ${ctx.city}`;
}

const COMPARATIVE: Record<Input, string> = {
  food: "Better food than", service: "Better service than", value: "Better value than",
  ambience: "Better ambience than", wait: "Shorter waits than", overall: "Higher ratings than",
};

// Aspects first, food leading; the Overall stars are a fallback, not a reason.
const ASPECT_ORDER: Input[] = ["food", "service", "value", "ambience", "wait"];

const FLAG_WORDS: Record<FlagType, string> = {
  food_poisoning: "food poisoning",
  hygiene: "poor hygiene",
  scam_overcharge: "overcharging",
  other_safety: "safety problems",
};

/** "4 recent reviews report food poisoning": what reviewers say, not a finding of fact. */
export function redFlagLine(g: RedFlag): string {
  const kinds = g.types.map((t) => FLAG_WORDS[t]);
  const what = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : (kinds[0] ?? "a serious problem");
  return `${plural(g.incidents12m, "recent review", "recent reviews")} ${g.incidents12m === 1 ? "reports" : "report"} ${what}`;
}

function countedStandings(r: Rollup) {
  const counted = new Set(r.inputs.filter((i) => i.counted).map((i) => i.input));
  return (r.standings ?? []).filter((s) => counted.has(s.input));
}

/** The counted standing the report leads with: an Aspect first (food leading), the Overall stars only as a fallback. */
export function leadStanding(r: Rollup) {
  const standings = countedStandings(r);
  return ASPECT_ORDER.flatMap((input) => standings.filter((s) => s.input === input))[0] ?? standings[0];
}

/** The one line a diner reads first. */
export function heroReason(r: Rollup, ctx: ReportContext): string {
  const forced = r.redFlags.find((g) => g.forcesAvoid);
  if (forced) return redFlagLine(forced);

  const standings = countedStandings(r);
  const aspects = ASPECT_ORDER.flatMap((input) => standings.filter((s) => s.input === input));
  const lead = leadStanding(r);

  if (!lead) {
    if (r.tier === "avoid") return "Reviewers rate it poorly";
    if (r.tier === "ok") return "Reviewers rate it as fine";
    return "Reviewers rate it well";
  }
  const group = peerGroupName(lead, ctx);

  switch (r.tier) {
    case "life_changing":
      return `Among the very best ${group}`;
    case "must_go":
    case "good": {
      const best = aspects.reduce<(typeof aspects)[number] | undefined>((a, s) => (!a || s.percentile > a.percentile ? s : a), undefined);
      const pick = best && best.percentile >= 65 ? best : standings.find((s) => s.input === "overall" && s.percentile >= 65);
      if (!pick) return "Reviewers rate it well";
      return `${COMPARATIVE[pick.input]} ${pick.percentile >= 90 ? "almost all" : "most"} ${peerGroupName(pick, ctx)}`;
    }
    case "ok":
      return `Fine if convenient: ${standingPhrase(lead.percentile)} ${group}`;
    default: {
      const worst = standings.reduce((a, s) => (s.percentile < a.percentile ? s : a));
      return worst.percentile < 35 ? cap(`${standingPhrase(worst.percentile)} ${peerGroupName(worst, ctx)}`) : "Reviewers rate it poorly";
    }
  }
}

/** Aspect standings in words: "Food: better than most traditional restaurants in Lisbon". */
export function aspectStandings(r: Rollup, ctx: ReportContext): { input: Input; label: string; text: string; phrase: string; level: 1 | 2 | 3 | 4 | 5; group: string }[] {
  const standings = countedStandings(r);
  return ASPECT_ORDER.flatMap((input) => standings.filter((s) => s.input === input))
    .map((s) => {
      const phrase = standingPhrase(s.percentile);
      const group = peerGroupName(s, ctx);
      return { input: s.input, label: INPUT_LABEL[s.input], text: `${phrase} ${group}`, phrase, level: standingLevel(s.percentile), group };
    });
}

const POSITION_ORDER: Input[] = ["food", "service", "overall", "value", "ambience", "wait"];

/** Every input's position among Peers for the "How we judged this" chart, uncounted ones included and flagged. */
export function aspectPositions(r: Rollup, ctx: ReportContext) {
  const counted = new Set(r.inputs.filter((i) => i.counted).map((i) => i.input));
  return POSITION_ORDER.flatMap((input) => (r.standings ?? []).filter((s) => s.input === input))
    .map((s) => ({ input: s.input, label: INPUT_LABEL[s.input], phrase: standingPhrase(s.percentile), level: standingLevel(s.percentile), group: peerGroupName(s, ctx), counted: counted.has(s.input) }));
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const PHRASE_ORDER = ["better than almost all", "better than most", "about typical for", "weaker than most", "weaker than almost all"];

/**
 * The hero's plain read of how the Restaurant stands, Aspects grouped by how they compare, plus how much
 * reviewers agree: "Food and service are better than almost all tascas in Lisbon; wait time is about typical."
 * Null when there is nothing to compare, so the hero shows only its headline.
 */
export function heroSummary(r: Rollup, ctx: ReportContext): string | null {
  const lines = aspectStandings(r, ctx);
  if (lines.length === 0) return null;
  const firstGroup = lines[0]!.group;
  const clauses = PHRASE_ORDER.flatMap((phrase, i) => {
    const members = lines.filter((l) => l.phrase === phrase);
    if (members.length === 0) return [];
    const group = members.every((m) => m.group === members[0]!.group) ? members[0]!.group : null;
    const withGroup = i === PHRASE_ORDER.findIndex((p) => lines.some((l) => l.phrase === p)) || (group !== null && group !== firstGroup);
    const names = joinList(members.map((m) => lower(m.label)));
    const tail = withGroup && group ? `${phrase} ${group}` : phrase.replace(/ for$/, "");
    return [`${names} ${members.length > 1 ? "are" : "is"} ${tail}`];
  });
  const standing = cap(clauses.join("; "));
  const agree = consistencyLine(r.consistencySpread);
  return agree ? `${standing}. ${agree}.` : `${standing}.`;
}

type ThemeLine = { label: string; reviewers: number; text: string };

/** Top 3 praised and top 3 criticised Themes, with how many reviewers raise each. */
export function strengthsAndWarnings(r: Rollup): { strengths: ThemeLine[]; warnings: ThemeLine[] } {
  const top = (polarity: 1 | -1): ThemeLine[] => r.themes
    .filter((t) => t.polarity === polarity)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => ({ label: THEMES[t.code].label, reviewers: t.count, text: plural(t.count, "reviewer", "reviewers") }));
  return { strengths: top(1), warnings: top(-1) };
}

export const provisionalNotice = () => "Early verdict: fewer comparisons yet";

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function changePointNotice(r: Rollup): string | null {
  if (!r.changePointAt) return null;
  return `${r.changePointDescription || "A change"} since ${monthYear(r.changePointAt)}: only reviews since then count`;
}

/** What a Not-enough-evidence Restaurant still lacks, one plain line per unmet bar. */
export function missingEvidence(nee: Rollup["notEnoughEvidence"]): string[] {
  const bars = nee.bars ?? {
    textReviews: { have: nee.textReviews, need: PARAMS.minTextReviews, met: nee.textReviews >= PARAMS.minTextReviews },
    foodMentions: { have: nee.foodMentions, need: PARAMS.minFoodMentions, met: nee.foodMentions >= PARAMS.minFoodMentions },
    newestReview: { have: nee.newestAgeMonths, need: PARAMS.maxNewestAgeMonths, met: nee.newestAgeMonths !== null && nee.newestAgeMonths <= PARAMS.maxNewestAgeMonths },
  };
  const lines: string[] = [];
  if (!bars.textReviews.met) lines.push(`Needs at least ${bars.textReviews.need} reviews with written text; has ${bars.textReviews.have}`);
  if (!bars.foodMentions.met) lines.push(`Needs at least ${bars.foodMentions.need} reviews that talk about the food; has ${bars.foodMentions.have}`);
  if (!bars.newestReview.met) {
    const age = bars.newestReview.have === null ? "there are none" : `the newest is ${Math.ceil(bars.newestReview.have)} months old`;
    lines.push(`Needs a review from the last ${bars.newestReview.need} months; ${age}`);
  }
  return lines;
}

const CAP_WORDS: [test: (cap: string) => boolean, words: string][] = [
  [(c) => c === "only one Crowd Source", "Only one review site was found"],
  [(c) => c.startsWith("fewer than 5 Reviews with text"), "Few recent written reviews"],
  [(c) => c.startsWith("Sources disagree"), "Review sites disagree about this restaurant"],
  [(c) => c.startsWith("text and stars disagree"), "Written reviews and star ratings disagree"],
  [(c) => c.startsWith("provisional:"), provisionalNotice()],
  [(c) => c.startsWith("a Crowd Source failed"), "One review site could not be read"],
];

/** Confidence reasons in plain words. A reason not recognised here is dropped, so no raw number leaks. */
export function confidenceReasons(caps: string[]): string[] {
  return caps.flatMap((c) => CAP_WORDS.find(([test]) => test(c))?.[1] ?? []);
}

export function consistencyLine(c: Rollup["consistencySpread"]): string | null {
  if (c.sd === null) return null;
  const how = c.sd < 0.6 ? "Reviewers mostly agree" : c.sd < 1 ? "Reviewers' experiences vary somewhat" : "Reviewers' experiences vary a lot";
  return `${how} (${plural(c.n, "review", "reviews")}, last ${c.windowMonths} months)`;
}
