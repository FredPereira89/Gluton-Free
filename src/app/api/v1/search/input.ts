type SearchInput =
  | { kind: "name"; value: string }
  | { kind: "place_id"; value: string }
  | { kind: "cid"; value: string }
  | { kind: "link_name"; value: string }
  | { kind: "invalid" };

const googleHost = /^(?:www\.|maps\.)?google\.(?:com|pt|co\.uk|es|fr|de|it)$/;
const tripadvisorHost = /^(?:www\.)?tripadvisor\.(?:com|pt|co\.uk|es|fr|de|it)$/;
const theForkHost = /^(?:www\.)?thefork\.(?:com|pt|co\.uk|es|fr|de|it)$/;
const placeId = /^[A-Za-z0-9_-]{5,}$/;

function normaliseSlug(value: string): string {
  try { return decodeURIComponent(value).replace(/[+_-]+/g, " ").trim(); }
  catch { return ""; }
}

function fromUrl(url: URL): SearchInput {
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "invalid" };
  const host = url.hostname.toLowerCase();
  if (googleHost.test(host)) {
    if (url.pathname !== "/" && !url.pathname.startsWith("/maps")) return { kind: "invalid" };
    const cid = url.searchParams.get("cid");
    if (cid && /^\d+$/.test(cid)) return { kind: "cid", value: cid };
    const id = url.searchParams.get("query_place_id") ?? url.searchParams.get("place_id")
      ?? url.searchParams.get("q")?.match(/^place_id:([A-Za-z0-9_-]+)$/)?.[1]
      ?? url.pathname.match(/!1s(ChIJ[A-Za-z0-9_-]+|GhIJ[A-Za-z0-9_-]+)/)?.[1];
    if (id && placeId.test(id)) return { kind: "place_id", value: id };
    const name = url.searchParams.get("query") ?? url.searchParams.get("q")
      ?? url.pathname.match(/^\/maps\/place\/([^/]+)/)?.[1];
    const value = name ? normaliseSlug(name) : "";
    return value ? { kind: "link_name", value } : { kind: "invalid" };
  }
  if (tripadvisorHost.test(host)) {
    const slug = url.pathname.match(/\/Restaurant_Review-[^/]*-Reviews-(.+)-[^/.-]+\.html$/i)?.[1];
    const value = slug ? normaliseSlug(slug) : "";
    return value ? { kind: "link_name", value } : { kind: "invalid" };
  }
  if (theForkHost.test(host)) {
    const path = url.pathname.match(/^\/(?:restaurant|restaurante)\/([^/]+)(?:\/(?:r)?\d+)?(?:\/.*)?$/i);
    const slug = path?.[1]?.replace(/-r\d+$/i, "");
    const value = slug ? normaliseSlug(slug) : "";
    return value ? { kind: "link_name", value } : { kind: "invalid" };
  }
  return { kind: "invalid" };
}

export async function searchInput(raw: string): Promise<SearchInput> {
  if (/^(?:ChIJ|GhIJ)[A-Za-z0-9_-]{5,}$/.test(raw)) return { kind: "place_id", value: raw };
  if (!/^(?:https?:\/\/|www\.)/i.test(raw) && !/^[^\s/]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) {
    return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? { kind: "invalid" } : { kind: "name", value: raw };
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { kind: "invalid" };
  }
  if (url.hostname.toLowerCase() !== "maps.app.goo.gl") return fromUrl(url);
  for (let hops = 0; hops < 5; hops++) {
    if (url.protocol !== "https:" || (url.hostname.toLowerCase() !== "maps.app.goo.gl" && !googleHost.test(url.hostname.toLowerCase()))) return { kind: "invalid" };
    let response: Response;
    try { response = await fetch(url.toString(), { redirect: "manual" }); }
    catch { return { kind: "invalid" }; }
    if (response.status < 300 || response.status >= 400) return { kind: "invalid" };
    const next = response.headers.get("location");
    if (!next) return { kind: "invalid" };
    try { url = new URL(next, url); } catch { return { kind: "invalid" }; }
    if (googleHost.test(url.hostname.toLowerCase())) return fromUrl(url);
  }
  return { kind: "invalid" };
}

export function sameRestaurantName(a: string, b: string): boolean {
  const normalise = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const expected = normalise(a);
  return !!expected && expected === normalise(b);
}
