import { DIRECTORY_DEFAULT_PAGE_SIZE, parseDirectoryQuery, type DirectoryQuery } from "./api-contract";

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
