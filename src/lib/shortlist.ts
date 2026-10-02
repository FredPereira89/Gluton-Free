// The shortlist: up to three Restaurants a diner is choosing between. Only slugs are kept, in this tab's
// sessionStorage, so it never caches a Verdict and ends with the session. The comparison page reads the
// slugs from its URL and loads the current Verdicts fresh.
export const SHORTLIST_LIMIT = 3;
export const SHORTLIST_KEY = "gluton-shortlist";

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

export function comparisonHref(slugs: readonly string[], from?: string): string {
  const params = new URLSearchParams();
  for (const slug of shortlistSlugs(slugs)) params.append("r", slug);
  if (from && from !== "/") params.set("from", from);
  return `/compare?${params.toString()}`;
}
