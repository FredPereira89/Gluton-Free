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
const emptyResults: SearchResponse = { known: [], candidates: [], recognised: null, message: null };

function detail(result: Result) {
  return [
    result.category,
    result.distanceMeters === null ? null : result.distanceMeters < 1000 ? `${result.distanceMeters} m away` : `${(result.distanceMeters / 1000).toFixed(1)} km away`,
    result.stars === null ? null : `${result.stars.toFixed(1)} ★${result.reviewCount === null ? "" : ` · ${result.reviewCount} reviews`}`,
    result.priceTier,
    result.status === "closed" ? "Closed now" : result.status === "temporarily_closed" ? "Temporarily closed" : null,
  ].filter(Boolean).join(" · ");
}

function formatResetTime(resetAt: string): string {
  return new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const [results, setResults] = useState<SearchResponse>(emptyResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [spendCapResetAt, setSpendCapResetAt] = useState<string | null>(null);
  const location = useRef<{ lat: number; lng: number } | null | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(emptyResults);
      setLoading(false);
      setError(false);
      setSpendCapResetAt(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setResults(emptyResults);
    setLoading(true);
    setError(false);
    setSpendCapResetAt(null);
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
        if (response.status === 429) {
          const problem = await response.json().catch(() => null) as { resetAt?: string } | null;
          if (active) setSpendCapResetAt(problem?.resetAt ?? new Date().toISOString());
          return;
        }
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
    <p className="muted">Search by name, paste a Google Maps, Tripadvisor or TheFork link, or enter a Google place ID.</p>
    <label htmlFor="restaurant-search" className="eyebrow">Restaurant name or link</label>
    <input id="restaurant-search" type="search" autoComplete="off" value={query}
      onChange={(event) => setQuery(event.target.value)} placeholder="Restaurant name, link or Google place ID" />
    <div role="status" aria-live="polite" className="small muted">
      {loading ? "Searching…"
        : spendCapResetAt ? `Today's search budget is spent. It resets at ${formatResetTime(spendCapResetAt)}.`
        : error ? "Search is unavailable. Try again."
        : results.message ?? (query.trim() && !results.recognised && !results.known.length && !results.candidates.length ? "No Restaurants found." : "")}
    </div>
    {results.recognised && <div className="search-group">
      <h2>Recognised Restaurant</h2>
      {"slug" in results.recognised ? <Link className="search-result" href={`/r/${encodeURIComponent(results.recognised.slug)}`}>
        <ResultContent result={results.recognised} />
        <span className="search-action">Open Verdict →</span>
      </Link> : <article className="search-result">
        <ResultContent result={results.recognised} />
      </article>}
    </div>}
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
