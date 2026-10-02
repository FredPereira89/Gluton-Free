"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PreviewLookupResponse, SearchResponse } from "@/lib/api-contract";
import { ArrowIcon } from "@/web/icons";
import { trackUsageEvent } from "@/web/usage-tracking";
import { isLookupQuery } from "@/lib/directory-url";

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
    result.stars === null ? null : `${result.stars.toFixed(1)} stars${result.reviewCount === null ? "" : ` · ${result.reviewCount} reviews`}`,
    result.priceTier,
    result.status === "closed" ? "Closed now" : result.status === "temporarily_closed" ? "Temporarily closed" : null,
  ].filter(Boolean).join(" · ");
}

function formatResetTime(resetAt: string): string {
  return new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function PreviewPanel({ loading, error, data, onClose, onStart, onRetry, starting, startError }: {
  loading: boolean; error: boolean; data: PreviewLookupResponse | null; onClose: () => void;
  onStart: () => void; onRetry: () => void; starting: boolean; startError: boolean;
}) {
  return <div className="preview-panel">
    {loading && <span className="small muted">Checking Listings…</span>}
    {error && <div><p className="small muted">Preview is unavailable.</p><button type="button" className="btn btn-secondary" onClick={onRetry}>Try preview again</button></div>}
    {data && <>
      {data.categoryGuess && <span className="small muted">Google category: {data.categoryGuess} (not a confirmed Format)</span>}
      {data.listings.map((listing) => <div className="preview-listing" key={`${listing.source}:${listing.placeRef}`}>
        <span className={`chip conf-${listing.confidence === "confident" ? "High" : "Low"}`}>
          {listing.source}{listing.autoAccept ? " · ready to add" : " · needs your check later"}
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
    <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
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

export default function SearchHome({ canAddRestaurant, initialQuery = "", trackUsage = false }: { canAddRestaurant: boolean; initialQuery?: string; trackUsage?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResponse>(emptyResults);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [spendCapResetAt, setSpendCapResetAt] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewLookupResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(false);
  const previewRequest = useRef<string | null>(null);
  const pushedQuery = useRef(initialQuery);

  // The search text narrows the directory below, so it lives in the URL with the rest of its state.
  useEffect(() => {
    const q = query.trim();
    if (q === (searchParams.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set("q", q); else params.delete("q");
      params.delete("page");
      pushedQuery.current = q;
      const search = params.toString();
      router.replace(search ? `/?${search}` : "/", { scroll: false });
      if (q && trackUsage) trackUsageEvent("search");
    }, 350);
    return () => clearTimeout(timer);
  }, [query, searchParams, router, trackUsage]);

  // A search text that changed some other way, such as "Clear filters", replaces what is typed.
  useEffect(() => {
    if (initialQuery === pushedQuery.current) return;
    pushedQuery.current = initialQuery;
    setQuery(initialQuery);
  }, [initialQuery]);

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

  async function addRestaurant() {
    const q = query.trim();
    if (!q || adding) return;
    setAdding(true);
    setAddError(false);
    setError(false);
    setSpendCapResetAt(null);
    setResults(emptyResults);
    try {
      const response = await fetch("/api/v1/search/add", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }),
      });
      if (response.status === 429) {
        const problem = await response.json().catch(() => null) as { resetAt?: string } | null;
        setSpendCapResetAt(problem?.resetAt ?? new Date().toISOString());
        return;
      }
      if (!response.ok) throw new Error("Add search failed");
      setResults(await response.json() as SearchResponse);
    } catch {
      setAddError(true);
    } finally {
      setAdding(false);
    }
  }

  useEffect(() => {
    const q = query.trim();
    setPreviewFor(null);
    if (!q || !isLookupQuery(q)) {
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
      try {
        const params = new URLSearchParams({ q });
        const response = await fetch(`/api/v1/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json() as SearchResponse;
        if (active) {
          setResults(data);
          setSearchedQuery(q);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query]);

  function candidateRow(result: SearchResponse["candidates"][number]) {
    if (!canAddRestaurant) return <div className="search-result" key={result.placeId}><ResultContent result={result} /></div>;
    return <div className="search-group" key={result.placeId}>
      <button type="button" className="search-result" onClick={() => openPreview(result.placeId)}>
        <ResultContent result={result} />
        <span className="search-action">Preview <ArrowIcon /></span>
      </button>
      {previewFor === result.placeId
        && <PreviewPanel loading={previewLoading} error={previewError} data={preview} onClose={() => setPreviewFor(null)} onRetry={() => void openPreview(result.placeId)} onStart={() => start(result.placeId)} starting={starting} startError={startError} />}
    </div>;
  }

  const noResults = isLookupQuery(query) && !!query.trim() && searchedQuery === query.trim() && !loading && !error && !adding && !addError && !spendCapResetAt
    && !results.recognised && !results.known.length && !results.candidates.length;

  return <section className="index search-home">
    <h1>Where to eat in Lisbon?</h1>
    <label htmlFor="restaurant-search" className="field-label">Search Restaurants or neighbourhoods</label>
    <input id="restaurant-search" type="search" autoComplete="off" value={query}
      onChange={(event) => { setSearchedQuery(""); setQuery(event.target.value); }} placeholder="Restaurant or neighbourhood" />
    <details className="search-help">
      <summary className="small">Have a link?</summary>
      <p className="small muted">Paste a Google Maps, Tripadvisor or TheFork link to open a stored listing.</p>
    </details>
    <div role="status" aria-live="polite" className="small muted">
      {loading ? "Searching…"
        : spendCapResetAt ? `Today's search budget is spent. It resets at ${formatResetTime(spendCapResetAt)}.`
        : adding ? "Searching Google Maps…"
        : addError ? "Could not search for that Restaurant. Try again."
        : error ? "Search is unavailable. Try again."
        : results.message ?? (isLookupQuery(query) && query.trim() && !results.recognised && !results.known.length && !results.candidates.length ? "No Restaurants found." : "")}
    </div>
    {canAddRestaurant && <button type="button" className="btn btn-secondary" disabled={!query.trim() || adding || loading} onClick={() => void addRestaurant()}>
      {adding ? "Searching Google Maps…" : "Owner: search Google Maps to add a Restaurant"}
    </button>}
    {results.recognised && <div className="search-group">
      <h2>Recognised Restaurant</h2>
      {"slug" in results.recognised ? <Link className="search-result" href={`/r/${encodeURIComponent(results.recognised.slug)}`}>
        <ResultContent result={results.recognised} />
        <span className="search-action">Open Verdict <ArrowIcon /></span>
      </Link> : candidateRow(results.recognised)}
    </div>}
    {!!results.known.length && <div className="search-group">
      <h2>{isLookupQuery(query) ? "Matching stored Restaurants" : "Google Maps matches for Owner add"}</h2>
      {results.known.map((result) => <Link className="search-result" href={`/r/${encodeURIComponent(result.slug)}`} key={result.slug}>
        <ResultContent result={result} />
        <span className="search-action">Open Verdict <ArrowIcon /></span>
      </Link>)}
    </div>}
    {!!results.candidates.length && <div className="search-group">
      <h2>Google Maps candidates for Owner add</h2>
      {results.candidates.map(candidateRow)}
    </div>}
    {noResults && <p className="small muted">No stored Restaurant matched that link. Search by name or neighbourhood instead.</p>}
    {canAddRestaurant && <Link href="/restaurants" className="small browse-link">Owner inventory · all lookups</Link>}
  </section>;
}
