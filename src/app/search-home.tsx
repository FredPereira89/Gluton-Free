"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PreviewLookupResponse, SearchResponse } from "@/lib/api-contract";

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

function PreviewPanel({ loading, error, data, onClose, onStart, starting, startError }: {
  loading: boolean; error: boolean; data: PreviewLookupResponse | null; onClose: () => void;
  onStart: () => void; starting: boolean; startError: boolean;
}) {
  return <div className="preview-panel">
    {loading && <span className="small muted">Checking Listings…</span>}
    {error && <span className="small muted">Preview is unavailable. Try again.</span>}
    {data && <>
      {data.categoryGuess && <span className="small muted">Google category: {data.categoryGuess} (not a confirmed Format)</span>}
      {data.listings.map((listing) => <div className="preview-listing" key={listing.source}>
        <span className={`chip conf-${listing.confidence === "confident" ? "High" : "Low"}`}>
          {listing.source}{listing.autoAccept ? " · auto-accept" : " · ask later"}
        </span>
        <a className="small" href={listing.url} target="_blank" rel="noreferrer">{listing.name}</a>
      </div>)}
      <span className="small muted">
        Estimate: ~{data.estimate.textReviews} text Reviews, ≈${data.estimate.costUsd.toFixed(2)}, ~{data.estimate.minutes} min
      </span>
      {data.notEnoughEvidenceWarning && <span className="search-warning">
        This Restaurant will probably have Not enough evidence. Look up anyway (≈$0.02)?
      </span>}
      <button type="button" className="btn" disabled={starting} onClick={onStart}>{starting ? "Starting…" : "Start lookup"}</button>
      {startError && <span role="alert" className="error">Could not start the lookup. Try again.</span>}
    </>}
    <button type="button" className="small" onClick={onClose}>Close</button>
  </div>;
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(emptyResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [spendCapResetAt, setSpendCapResetAt] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewLookupResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const location = useRef<{ lat: number; lng: number } | null | undefined>(undefined);
  const previewRequest = useRef<string | null>(null);

  async function openPreview(placeId: string) {
    previewRequest.current = placeId;
    setPreviewFor(placeId);
    setPreview(null);
    setPreviewError(false);
    setStartError(false);
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/v1/lookups/preview", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ googlePlaceId: placeId }),
      });
      if (!response.ok) throw new Error("Preview failed");
      const data = await response.json() as PreviewLookupResponse;
      if (previewRequest.current === placeId) setPreview(data);
    } catch {
      if (previewRequest.current === placeId) setPreviewError(true);
    } finally {
      if (previewRequest.current === placeId) setPreviewLoading(false);
    }
  }

  async function start(placeId: string) {
    if (!preview || starting) return;
    setStarting(true);
    setStartError(false);
    try {
      const response = await fetch("/api/v1/lookups", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ googlePlaceId: placeId, listings: preview.listings }),
      });
      if (!response.ok) throw new Error("Lookup failed");
      const result = await response.json() as { restaurantSlug: string };
      router.push(`/r/${encodeURIComponent(result.restaurantSlug)}`);
    } catch {
      setStartError(true);
      setStarting(false);
    }
  }

  useEffect(() => {
    const q = query.trim();
    setPreviewFor(null);
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
      {results.candidates.map((result) => <div className="search-group" key={result.placeId}>
        <button type="button" className="search-result" onClick={() => openPreview(result.placeId)}>
          <ResultContent result={result} />
          <span className="search-action">Preview →</span>
        </button>
        {previewFor === result.placeId
          && <PreviewPanel loading={previewLoading} error={previewError} data={preview} onClose={() => setPreviewFor(null)} onStart={() => start(result.placeId)} starting={starting} startError={startError} />}
      </div>)}
    </div>}
    <Link href="/restaurants" className="small">Browse looked-up Restaurants</Link>
  </section>;
}
