"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "@/lib/api-contract";

const warnings = {
  same_name: "Several Restaurants share this name. Check the address.",
  outside_lisbon: "Outside Lisbon. Its Verdict will stay Provisional.",
  maybe_not_restaurant: "Maybe not a Restaurant — check whether it serves food.",
};

type Result = SearchResponse["known"][number] | SearchResponse["candidates"][number];

function detail(result: Result) {
  return [
    result.category,
    result.distanceMeters === null ? null : result.distanceMeters < 1000 ? `${result.distanceMeters} m away` : `${(result.distanceMeters / 1000).toFixed(1)} km away`,
    result.stars === null ? null : `${result.stars.toFixed(1)} ★${result.reviewCount === null ? "" : ` · ${result.reviewCount} reviews`}`,
    result.priceTier,
    result.status === "closed" ? "Closed now" : result.status === "temporarily_closed" ? "Temporarily closed" : null,
  ].filter(Boolean).join(" · ");
}

function ResultContent({ result }: { result: Result }) {
  return <>
    <strong>{result.name}</strong>
    {result.address && <span className="small muted">{result.address}</span>}
    <span className="small muted">{detail(result)}</span>
    {"warnings" in result && result.warnings.map((warning) => <span className="search-warning" key={warning}>{warnings[warning]}</span>)}
  </>;
}

export default function SearchHome() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>({ known: [], candidates: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const location = useRef<{ lat: number; lng: number } | null | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults({ known: [], candidates: [] });
      setLoading(false);
      setError(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setResults({ known: [], candidates: [] });
    setLoading(true);
    setError(false);
    const timer = setTimeout(async () => {
      if (location.current === undefined) {
        location.current = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: Number(position.coords.latitude.toFixed(7)), lng: Number(position.coords.longitude.toFixed(7)) }),
            () => resolve(null),
            { timeout: 3000, maximumAge: 60_000 },
          );
        });
      }
      if (!active) return;
      const params = new URLSearchParams({ q });
      if (location.current) params.set("near", `${location.current.lat},${location.current.lng}`);
      try {
        const response = await fetch(`/api/v1/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json() as SearchResponse;
        if (active) setResults(data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query]);

  return <section className="index search-home">
    <h1>Find a Restaurant</h1>
    <p className="muted">Search by name to see its Verdict or find a Restaurant to look up.</p>
    <label htmlFor="restaurant-search" className="eyebrow">Restaurant name</label>
    <input id="restaurant-search" type="search" autoComplete="off" value={query}
      onChange={(event) => setQuery(event.target.value)} placeholder="Name of a Restaurant" />
    <div role="status" aria-live="polite" className="small muted">
      {loading ? "Searching…" : error ? "Search is unavailable. Try again." : query.trim() && !results.known.length && !results.candidates.length ? "No Restaurants found." : ""}
    </div>
    {!!results.known.length && <div className="search-group">
      <h2>Already looked up</h2>
      {results.known.map((result) => <Link className="search-result" href={`/r/${encodeURIComponent(result.slug)}`} key={result.slug}>
        <ResultContent result={result} />
        <span className="search-action">Open Verdict →</span>
      </Link>)}
    </div>}
    {!!results.candidates.length && <div className="search-group">
      <h2>New Restaurants</h2>
      {results.candidates.map((result) => <article className="search-result" key={result.placeId}>
        <ResultContent result={result} />
      </article>)}
    </div>}
    <Link href="/restaurants" className="small">Browse looked-up Restaurants</Link>
  </section>;
}
