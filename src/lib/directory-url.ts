import { DIRECTORY_DEFAULT_PAGE_SIZE, parseDirectoryQuery, type DirectoryQuery } from "./api-contract";

/** Link/place references open the stored-link recogniser instead of filtering every row by URL text. */
export function isLookupQuery(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|www\.|[^\s/]+\.[a-z]{2,}(?:\/|$)|cid:|ChIJ|GhIJ)/i.test(value.trim());
}

// The directory's state as a home URL: only what differs from the default view is written, so a
// refresh or a shared link restores it and the plain `/` stays the default.
export function directoryHref(query: DirectoryQuery, options: { resetPage?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sort !== "tier") params.set("sort", query.sort);
  for (const name of ["tier", "family", "price", "area", "diet"] as const) for (const value of query[name]) params.append(name, value);
  if (query.nee) params.set("nee", "1");
  if (query.pageSize !== DIRECTORY_DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  if (query.page > 1 && !options.resetPage) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

// A page's `searchParams`, read as a directory query. A URL that does not parse shows the default view.
export function directoryQueryFromPage(searchParams: Record<string, string | string[] | undefined>): DirectoryQuery {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    for (const each of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(name, each);
  }
  try {
    return parseDirectoryQuery(params);
  } catch {
    return parseDirectoryQuery(new URLSearchParams());
  }
}

/** A report may return only to a canonical home-directory URL, never an arbitrary internal route. */
export function safeDirectoryReturn(value: string | undefined): string {
  if (!value || /[\x00-\x1f\x7f\\]/.test(value) || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const base = "https://directory.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname !== "/") return "/";
    return directoryHref(parseDirectoryQuery(url.searchParams));
  } catch {
    return "/";
  }
}
