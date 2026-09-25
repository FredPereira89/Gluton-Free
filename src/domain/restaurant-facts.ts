export const FORMATS = [
  "tasca", "restaurante_tradicional", "marisqueira_cervejaria", "churrasqueira",
  "casa_de_fado", "casual_contemporary", "international_casual", "fine_dining",
  "cafe_pastelaria", "brunch_all_day_cafe", "snack_street",
] as const;

export type PriceTier = "€" | "€€" | "€€€" | "€€€€";
const tiers: PriceTier[] = ["€", "€€", "€€€", "€€€€"];

/** A Source's stated price wins over a price inferred from Reviews. */
export function sourcePriceTier(source: string, value: string | null): PriceTier | null {
  if (!value) return null;
  const stated = value.trim().toLowerCase();
  if (source === "thefork") {
    const amount = Number(stated.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount < 15 ? "€" : amount < 30 ? "€€" : amount <= 60 ? "€€€" : "€€€€";
  }
  if (tiers.includes(value as PriceTier)) return value as PriceTier;
  if (source === "tripadvisor" && /^\${1,4}$/.test(stated)) return tiers[stated.length - 1]!;
  return ({ inexpensive: "€", moderate: "€€", expensive: "€€€", very_expensive: "€€€€" } as Record<string, PriceTier>)[stated] ?? null;
}

export function choosePriceTier(
  listings: { source: string; priceLevel: string | null }[],
  reviewPriceTier: PriceTier | null,
): { tier: PriceTier; provenance: "source" | "llm" } | null {
  for (const source of ["thefork", "google", "tripadvisor"]) {
    const listing = listings.find((entry) => entry.source === source);
    const tier = sourcePriceTier(source, listing?.priceLevel ?? null);
    if (tier) return { tier, provenance: "source" };
  }
  return reviewPriceTier ? { tier: reviewPriceTier, provenance: "llm" } : null;
}
