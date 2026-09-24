import { INFORMATIVE_ONLY, INPUTS, type Input } from "@/domain/aspects";
import type { Rollup } from "./rollup";

export type PeerLevel = "format" | "family" | "city";
export type PeerGroupStat = {
  city: string;
  level: PeerLevel;
  key: string;
  input: Input;
  sortedTheta: number[];
  formatMean: number;
  k: number;
  composite: number[];
  exceptionalPrior: { alpha: number; beta: number };
  peerCount: number;
};
export type PeerSnapshot = { id: number; month: string; publishedAt: string; groups: PeerGroupStat[] };
export type Standing = { input: Input; theta: number; percentile: number; level: PeerLevel; key: string; peerCount: number };

const FORMAT_FAMILY: Record<string, string> = {
  tasca: "traditional_portuguese", restaurante_tradicional: "traditional_portuguese",
  marisqueira_cervejaria: "traditional_portuguese", marisqueira: "traditional_portuguese",
  cervejaria: "traditional_portuguese", churrasqueira: "traditional_portuguese", casa_de_fado: "traditional_portuguese",
  casual_contemporary: "casual", casual: "casual", international_casual: "casual", fine_dining: "fine_dining",
  cafe_pastelaria: "quick_cafe", cafe: "quick_cafe", pastelaria: "quick_cafe",
  brunch_all_day_cafe: "quick_cafe", brunch: "quick_cafe", snack_street: "quick_cafe", snack: "quick_cafe", street_food: "quick_cafe",
};
const MIN_PEERS = 30;
export const DEFAULT_SHRINK_K = 10;
const keyOf = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function midRank(sorted: number[], value: number): number {
  if (!sorted.length) return 0;
  let below = 0;
  let equal = 0;
  for (const point of sorted) {
    if (point < value) below++;
    else if (point === value) equal++;
  }
  return (below + equal / 2) * 100 / sorted.length;
}

function groupFor(snapshot: PeerSnapshot, city: string, format: string, input: Input): PeerGroupStat | undefined {
  const formatKey = keyOf(format);
  const candidates: { level: PeerLevel; key: string }[] = [
    { level: "format", key: formatKey },
    { level: "family", key: FORMAT_FAMILY[formatKey] ?? formatKey },
    { level: "city", key: city },
  ];
  for (const candidate of candidates) {
    const group = snapshot.groups.find((g) => g.city === city && g.level === candidate.level && keyOf(g.key) === keyOf(candidate.key) && g.input === input);
    if (group && group.peerCount >= MIN_PEERS && group.sortedTheta.length === group.peerCount) return group;
  }
}

export function judgeWithSnapshot(rollup: Rollup, snapshot: PeerSnapshot | null | undefined, city: string | undefined, format: string): Rollup {
  if (!snapshot || !city || city.toLowerCase() !== "lisbon") return { ...rollup, peerSnapshot: null, standings: [] };
  const selected = new Map<Input, PeerGroupStat>();
  const standings: Standing[] = [];
  for (const stat of rollup.inputs) {
    const group = groupFor(snapshot, city, format, stat.input);
    if (!group) continue;
    selected.set(stat.input, group);
    // The provisional theta encodes the weighted sum with its zero prior and k=10.
    const weightedSum = stat.theta * (stat.sumW + DEFAULT_SHRINK_K);
    const theta = (weightedSum + group.k * group.formatMean) / (stat.sumW + group.k);
    standings.push({ input: stat.input, theta, percentile: midRank(group.sortedTheta, theta), level: group.level, key: group.key, peerCount: group.peerCount });
  }
  const counted = INPUTS.filter((i) => !(INFORMATIVE_ONLY[format] ?? []).includes(i));
  if (counted.some((i) => !selected.has(i))) return { ...rollup, peerSnapshot: null, standings: [] };

  return {
    ...rollup,
    peerSnapshot: { id: snapshot.id, month: snapshot.month, publishedAt: snapshot.publishedAt },
    standings,
  };
}
