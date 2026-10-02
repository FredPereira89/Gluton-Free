// Keep a Review's attribution, but omit stored links that point outside its Source.
const sourceHosts: Record<string, RegExp> = {
  google: /^(?:(?:www\.|maps\.)?google\.(?:com|pt|co\.uk|es|fr|de|it)|maps\.app\.goo\.gl)$/,
  tripadvisor: /^(?:www\.)?tripadvisor\.(?:com|pt|co\.uk|es|fr|de|it)$/,
  thefork: /^(?:www\.)?thefork\.(?:com|pt|co\.uk|es|fr|de|it)$/,
};

export function sourceListingUrl(source: string, value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = sourceHosts[source];
    if (host && !host.test(url.hostname)) return null;
    if (source === "google" && url.hostname !== "maps.app.goo.gl"
      && !url.hostname.startsWith("maps.") && !/^\/maps(?:\/|$)/.test(url.pathname)) return null;
    if (source === "tripadvisor" && !/^\/Restaurant_Review-/.test(url.pathname)) return null;
    if (source === "thefork" && !/^\/(?:restaurant|restaurante)\//.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
