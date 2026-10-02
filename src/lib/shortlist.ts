// The shortlist: up to three Restaurants a diner is choosing between. Only slugs are kept, in this tab's
// sessionStorage, so it never caches a Verdict and ends with the session. The comparison page reads the
// slugs from its URL and loads the current Verdicts fresh.
export const SHORTLIST_LIMIT = 3;
export const SHORTLIST_KEY = "gluton-shortlist";
/** Display names for the slugs held, so the dock can name each one without a round trip. */
export const SHORTLIST_NAMES_KEY = "gluton-shortlist-names";

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

/** Slugs from untrusted text (storage or a URL): valid, de-duplicated and capped at the limit. */
export function shortlistSlugs(values: readonly unknown[]): string[] {
  const slugs: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && SLUG.test(value) && !slugs.includes(value)) slugs.push(value);
    if (slugs.length === SHORTLIST_LIMIT) break;
  }
  return slugs;
}

/** Names from untrusted storage text: only strings for held slugs, trimmed and capped. */
export function shortlistNames(value: unknown, slugs: readonly string[]): Record<string, string> {
  const names: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return names;
  for (const slug of slugs) {
    const name = (value as Record<string, unknown>)[slug];
    if (typeof name === "string" && name.trim()) names[slug] = name.trim().slice(0, 120);
  }
  return names;
}

/** A readable stand-in when a name was not kept: the slug, spaced out. */
export function slugLabel(slug: string): string {
  return slug.replace(/-/g, " ");
}

export function comparisonHref(slugs: readonly string[], from?: string): string {
  const params = new URLSearchParams();
  for (const slug of shortlistSlugs(slugs)) params.append("r", slug);
  if (from && from !== "/") params.set("from", from);
  return `/compare?${params.toString()}`;
}
