import { TIERS } from "@/domain/aspects";
import { bookingLink } from "@/domain/booking-link";
import { formatFamily, formatLabel } from "@/domain/format-labels";
import { neighbourhoodOf } from "@/domain/neighbourhood";
import { normaliseName } from "@/app/api/v1/search/input";
import type { DirectoryItem, DirectoryQuery, DirectoryResponse } from "./api-contract";

// One Restaurant as the directory reads it: the latest Verdict, the Listings that matter for the
// booking link, and the Peer standings behind the Food and Value sorts.
export type DirectoryRow = {
  slug: string;
  name: string;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  format: string | null;
  priceTier: DirectoryItem["priceTier"];
  state: DirectoryItem["state"];
  tier: DirectoryItem["tier"];
  confidence: DirectoryItem["confidence"];
  provisional: boolean;
  foodPercentile: number | null;
  valuePercentile: number | null;
  googlePlaceId: string | null;
  theForkUrl: string | null;
};

const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 } as const;

function toItem(row: DirectoryRow): DirectoryItem {
  return {
    slug: row.slug,
    name: row.name,
    state: row.state,
    tier: row.tier,
    provisional: row.provisional,
    confidence: row.confidence,
    format: row.format ? formatLabel(row.format) : "",
    formatFamily: row.format ? formatFamily(row.format) : null,
    priceTier: row.priceTier,
    neighbourhood: neighbourhoodOf(row),
    booking: bookingLink(row),
  };
}

// A pasted link or place ID starts a lookup in the search bar; it is not a word to narrow by.
const LOOKUP_INPUT = /^(?:https?:\/\/|www\.|cid:|ChIJ|GhIJ)/i;

function searchWords(q: string): string[] {
  if (LOOKUP_INPUT.test(q)) return [];
  return normaliseName(q).split(" ").filter(Boolean);
}

export function buildDirectory(rows: DirectoryRow[], query: DirectoryQuery): DirectoryResponse {
  const all = rows.map((row) => {
    const item = toItem(row);
    return { row, item, haystack: normaliseName(`${item.name} ${item.neighbourhood} ${item.format}`) };
  });
  const words = searchWords(query.q);
  const matches = (entry: (typeof all)[number]) =>
    words.every((word) => entry.haystack.includes(word)) &&
    (query.tier.length === 0 || (entry.item.tier !== null && query.tier.includes(entry.item.tier))) &&
    (query.family.length === 0 || (entry.item.formatFamily !== null && query.family.includes(entry.item.formatFamily))) &&
    (query.price.length === 0 || (entry.item.priceTier !== null && query.price.includes(entry.item.priceTier))) &&
    (query.area.length === 0 || query.area.includes(entry.item.neighbourhood));
  const matching = all.filter(matches);
  const visible = matching.filter(({ row }) => query.nee || row.state !== "not_enough_evidence");
  type Entry = (typeof all)[number];
  const tierRank = (row: DirectoryRow) => (row.tier ? TIERS.indexOf(row.tier) : -1);
  const byName = (a: Entry, b: Entry) => a.item.name.localeCompare(b.item.name, "pt");
  const byTier = (a: Entry, b: Entry) =>
    tierRank(b.row) - tierRank(a.row) ||
    (CONFIDENCE_RANK[b.row.confidence ?? "low"] ?? 0) - (CONFIDENCE_RANK[a.row.confidence ?? "low"] ?? 0);
  // Best first; a Restaurant without a standing sorts after every one that has it.
  const highest = (value: (row: DirectoryRow) => number | null) => (a: Entry, b: Entry) =>
    (value(b.row) ?? -Infinity) - (value(a.row) ?? -Infinity) || 0;
  const cheapest = (a: Entry, b: Entry) =>
    (a.row.priceTier?.length ?? Infinity) - (b.row.priceTier?.length ?? Infinity) || 0;
  const primary = {
    tier: byTier,
    food: highest((row) => row.foodPercentile),
    value: highest((row) => row.valuePercentile),
    price: cheapest,
    name: byName,
  }[query.sort];
  const sorted = [...visible].sort((a, b) => primary(a, b) || byTier(a, b) || byName(a, b));
  const counts = new Map<string, number>();
  for (const { item } of all.filter(({ row }) => query.nee || row.state !== "not_enough_evidence")) counts.set(item.neighbourhood, (counts.get(item.neighbourhood) ?? 0) + 1);
  const neighbourhoods = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt"));
  const totalPages = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  return {
    items: sorted.slice((page - 1) * query.pageSize, page * query.pageSize).map(({ item }) => item),
    page,
    pageSize: query.pageSize,
    total: sorted.length,
    totalPages,
    hiddenNotEnoughEvidence: matching.length - visible.length,
    neighbourhoods,
  };
}
