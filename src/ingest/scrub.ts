// Regex scrub applied at ingest, before anything is stored. Catches contact details and
// handles; personal names in free text are removed later by the extractor's name spans
// (see redactNames), because no regex can find them reliably.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const URL_ = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const HANDLE = /(^|[\s(])@[\w.]{2,30}\b/g;
// 9+ digits with optional separators / country code, e.g. +351 912 345 678, 21 886 1815.
const PHONE = /(?<![\w€$£.,])\+?\d[\d\s().-]{7,}\d(?![\w%€])/g;

export function scrubText(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(URL_, "[link]")
    .replace(HANDLE, "$1[handle]")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[phone]" : m))
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Replaces each personal name the extractor found with [name]. Whole-word, case-sensitive. */
export function redactNames(text: string, names: string[]): string {
  let out = text;
  for (const name of names) {
    const n = name.trim();
    if (n.length < 2) continue;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"), "[name]");
  }
  return out;
}
