// The extractor's gold set (issue #28): a frozen sample of scrubbed text Reviews, stratified
// across Sources and languages, kept alongside the current extractor's own output. Before a
// model or schema change ships, scripts/compare-extractor.ts runs the candidate over the same
// text and reports where it disagrees with this frozen baseline. See scripts/gold-set.ts (build)
// and scripts/compare-extractor.ts (compare) for the runnable commands.
import { scrubText } from "@/ingest/scrub";
import { ASPECTS } from "@/domain/aspects";
import type { Extracted } from "./extract";

export const GOLD_SET_MIN = 200;
export const GOLD_SET_MAX = 300;

/** A Review a gold set could be built from. No stars/identity fields: only what selection needs. */
export type GoldCandidate = {
  reviewId: number;
  source: string;
  language: string;
  text: string;
};

/** The current extractor's output for one Review, minus reviewId and the names used only to redact. */
export type GoldBaseline = Omit<Extracted, "reviewId" | "names">;

/**
 * Stratifies candidates by (Source, language) and draws round-robin across groups so no single
 * group dominates, capped at `max`. Drops any candidate `scrubText` would still change, as a
 * defense-in-depth check for leftover contact info (email/URL/handle/phone). Personal names are
 * not `scrubText`'s job: a Review only reaches here once it has an analysis row, which means
 * `saveAnalyses` (src/analysis/store.ts) already redacted its names permanently via `redactNames`.
 */
export function selectGoldSample(candidates: GoldCandidate[], max = GOLD_SET_MAX): GoldCandidate[] {
  const clean = candidates.filter((c) => scrubText(c.text) === c.text);
  const groups = new Map<string, GoldCandidate[]>();
  for (const c of clean) {
    const key = `${c.source}|${c.language}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }
  const queues = [...groups.values()];
  const out: GoldCandidate[] = [];
  for (let i = 0; out.length < max && queues.some((q) => q.length > 0); i++) {
    const next = queues[i % queues.length]!.shift();
    if (next) out.push(next);
  }
  return out;
}

export const COMPARED_FIELDS = [...ASPECTS, "exceptional", "change", "themes", "flags", "quote"] as const;
export type ComparedField = (typeof COMPARED_FIELDS)[number];

export type FieldDiff = { field: ComparedField; baseline: unknown; candidate: unknown };
export type ReviewDiff = { reviewId: number; diffs: FieldDiff[] };

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sb = new Set(b);
  return a.length === sb.size && a.every((x) => sb.has(x));
};

/** Per-field comparison of one Review's baseline against a candidate extractor's output. */
export function diffExtraction(reviewId: number, baseline: GoldBaseline, candidate: GoldBaseline): ReviewDiff {
  const diffs: FieldDiff[] = [];
  for (const aspect of ASPECTS) {
    if (baseline.aspects[aspect] !== candidate.aspects[aspect]) {
      diffs.push({ field: aspect, baseline: baseline.aspects[aspect], candidate: candidate.aspects[aspect] });
    }
  }
  if (baseline.exceptional !== candidate.exceptional) {
    diffs.push({ field: "exceptional", baseline: baseline.exceptional, candidate: candidate.exceptional });
  }
  if (baseline.change !== candidate.change) {
    diffs.push({ field: "change", baseline: baseline.change, candidate: candidate.change });
  }
  if (!sameSet(baseline.themes, candidate.themes)) {
    diffs.push({ field: "themes", baseline: baseline.themes, candidate: candidate.themes });
  }
  // Evidence text is not compared: the candidate can quote a different span and still agree.
  const flagKey = (f: GoldBaseline["flags"][number]) => `${f.type}:${f.severity}:${f.firstHand}`;
  const bFlags = [...new Set(baseline.flags.map(flagKey))].sort();
  const cFlags = [...new Set(candidate.flags.map(flagKey))].sort();
  if (!sameSet(bFlags, cFlags)) diffs.push({ field: "flags", baseline: bFlags, candidate: cFlags });

  // Text is not compared: the candidate can pick a different verbatim span and still agree.
  const bQuote = baseline.quote ? { aspect: baseline.quote.aspect, polarity: baseline.quote.polarity } : null;
  const cQuote = candidate.quote ? { aspect: candidate.quote.aspect, polarity: candidate.quote.polarity } : null;
  if (bQuote?.aspect !== cQuote?.aspect || bQuote?.polarity !== cQuote?.polarity) {
    diffs.push({ field: "quote", baseline: bQuote, candidate: cQuote });
  }
  return { reviewId, diffs };
}

export type FieldAgreement = { field: ComparedField; agree: number; total: number };

/** Per-field agreement rate across every compared Review. */
export function summarizeAgreement(fields: readonly ComparedField[], reviewDiffs: ReviewDiff[], total: number): FieldAgreement[] {
  return fields.map((field) => {
    const disagree = reviewDiffs.filter((r) => r.diffs.some((d) => d.field === field)).length;
    return { field, agree: total - disagree, total };
  });
}
