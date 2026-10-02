"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobResponse } from "@/lib/api-contract";

export function LookupProgress({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    setRetryStatus(null);
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/retry`, { method: "POST" });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(problem?.detail ?? problem?.title ?? "Could not retry this lookup. Try again.");
      }
      setRetryCount((n) => n + 1);
      setRetryStatus("Retry queued. Progress will update here.");
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : "Could not retry this lookup. Try again.");
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    let active = true;
    let terminalHandled = false;
    async function poll() {
      if (terminalHandled) return;
      try {
        const response = await fetch(`/api/v1/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Job unavailable");
        const next = await response.json() as JobResponse;
        if (!active) return;
        setJob(next);
        setUnavailable(false);
        if (next.status === "succeeded" || next.status === "failed") {
          terminalHandled = true;
          router.refresh();
        }
      } catch {
        if (active) setUnavailable(true);
      }
    }
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, router, retryCount]);

  return <section className="sec lookup-progress" aria-live="polite">
    <h2>Lookup progress</h2>
    <p className="small muted">The lookup continues if you leave this page.</p>
    {job?.etaSeconds !== null && job?.etaSeconds !== undefined && <p>About {Math.ceil(job.etaSeconds / 60)} minutes left</p>}
    {unavailable && <p className="small muted">Progress is temporarily unavailable. Retrying…</p>}
    {job?.status === "failed" && <div>
      <p role="alert" className="error">Lookup failed: {job.error?.detail ?? "please try again later"}</p>
      <button type="button" className="btn btn-secondary" onClick={() => void retry()} disabled={retrying}>{retrying ? "Retrying…" : "Retry"}</button>
      {retryStatus && <p className="small muted" role="status">{retryStatus}</p>}
      {retryError && <p className="error" role="alert">{retryError}</p>}
    </div>}
    <ol>{(job?.steps ?? []).map((step) => <li key={step.name}>
      {step.name} <span className="small muted">{step.status}</span>
    </li>)}</ol>
    {!!job?.sources.length && <div>
      <h3>Sources · not a Verdict</h3>
      <ul>{job.sources.map((source) => <li key={source.code}>
        {source.name}: {source.stars === null ? "—" : `${source.stars.toFixed(1)} stars`}, {source.reviewCount ?? "—"} Reviews
        {source.fetchedCount !== null ? ` · ${source.fetchedCount} fetched` : ""}
      </li>)}</ul>
    </div>}
    {Array.isArray(job?.facts.askLater) && job.facts.askLater.length > 0 &&
      <p className="small muted">{job.facts.askLater.length} possible Listing{job.facts.askLater.length === 1 ? "" : "s"} to check later. This does not hold up the lookup.</p>}
    {job && <details className="lookup-cost"><summary>Lookup cost</summary><p className="small muted">Vendor ${job.vendorUsd.toFixed(3)} · AI ${job.llmUsd.toFixed(3)}</p></details>}
  </section>;
}
