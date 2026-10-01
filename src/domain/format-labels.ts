// How a Format is shown to a reader: a human label, never the stored code. Shared by the directory
// and the report.
import { FORMATS } from "./restaurant-facts";

type Format = (typeof FORMATS)[number];

const FORMAT_LABEL: Record<Format, string> = {
  tasca: "Tasca",
  restaurante_tradicional: "Traditional restaurant",
  marisqueira_cervejaria: "Marisqueira & cervejaria",
  churrasqueira: "Churrasqueira",
  casa_de_fado: "Casa de fado",
  casual_contemporary: "Casual contemporary",
  international_casual: "International casual",
  fine_dining: "Fine dining",
  cafe_pastelaria: "Café & pastelaria",
  brunch_all_day_cafe: "Brunch & all-day café",
  snack_street: "Snacks & street food",
};

export const FORMAT_FAMILIES = [
  { code: "traditional_portuguese", label: "Traditional Portuguese" },
  { code: "casual", label: "Casual" },
  { code: "fine_dining", label: "Fine dining" },
  { code: "quick_cafe", label: "Quick & café" },
] as const;
export type FormatFamily = (typeof FORMAT_FAMILIES)[number]["code"];

const FAMILY_OF: Record<Format, FormatFamily> = {
  tasca: "traditional_portuguese", restaurante_tradicional: "traditional_portuguese",
  marisqueira_cervejaria: "traditional_portuguese", churrasqueira: "traditional_portuguese", casa_de_fado: "traditional_portuguese",
  casual_contemporary: "casual", international_casual: "casual",
  fine_dining: "fine_dining",
  cafe_pastelaria: "quick_cafe", brunch_all_day_cafe: "quick_cafe", snack_street: "quick_cafe",
};

const isFormat = (value: string): value is Format => value in FORMAT_LABEL;

export function formatLabel(format: string): string {
  if (isFormat(format)) return FORMAT_LABEL[format];
  const words = format.replace(/_+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The family a Format belongs to; an unknown Format has none. */
export function formatFamily(format: string): FormatFamily | null {
  return isFormat(format) ? FAMILY_OF[format] : null;
}

const FORMAT_PLURAL: Record<Format, string> = {
  tasca: "tascas",
  restaurante_tradicional: "traditional restaurants",
  marisqueira_cervejaria: "marisqueiras & cervejarias",
  churrasqueira: "churrasqueiras",
  casa_de_fado: "casas de fado",
  casual_contemporary: "casual contemporary restaurants",
  international_casual: "international casual restaurants",
  fine_dining: "fine dining restaurants",
  cafe_pastelaria: "cafés & pastelarias",
  brunch_all_day_cafe: "brunch & all-day cafés",
  snack_street: "snack & street-food spots",
};

const FAMILY_PLURAL: Record<FormatFamily, string> = {
  traditional_portuguese: "traditional Portuguese restaurants",
  casual: "casual restaurants",
  fine_dining: "fine dining restaurants",
  quick_cafe: "quick-bite & café spots",
};

/** What a group of Restaurants of one Format is called in running text, lowercase: "tascas". */
export function formatPlural(format: string): string {
  return isFormat(format) ? FORMAT_PLURAL[format] : `${formatLabel(format).toLowerCase()} restaurants`;
}

/** The same for a Format family: "traditional Portuguese restaurants". */
export function familyPlural(family: string): string {
  return family in FAMILY_PLURAL ? FAMILY_PLURAL[family as FormatFamily] : "restaurants";
}
