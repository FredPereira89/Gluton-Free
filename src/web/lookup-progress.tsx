"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobResponse } from "@/lib/api-contract";

export function LookupProgress({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch(`/api/v1/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Job unavailable");
        const next = await response.json() as JobResponse;
        if (!active) return;
        setJob(next);
        setUnavailable(false);
        if (next.status === "succeeded") router.refresh();
      } catch {
        if (active) setUnavailable(true);
      }
    }
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, router]);

  return <section className="sec lookup-progress" aria-live="polite">
    <h2>Lookup progress</h2>
    <p className="small muted">The lookup continues if you leave this page.</p>
    {job?.etaSeconds !== null && job?.etaSeconds !== undefined && <p>About {Math.ceil(job.etaSeconds / 60)} minutes left</p>}
    {unavailable && <p className="small muted">Progress is temporarily unavailable. Retrying…</p>}
    {job?.status === "failed" && <p role="alert" className="error">Lookup failed: {job.error ?? "please try again later"}</p>}
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
    {job && <p className="small muted">Vendor ${job.vendorUsd.toFixed(3)} · AI ${job.llmUsd.toFixed(3)}</p>}
  </section>;
}
