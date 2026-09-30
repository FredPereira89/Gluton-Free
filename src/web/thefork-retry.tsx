"use client";

import { useState } from "react";
import { acceptedJobSchema } from "@/lib/api-contract";
import { useJobRefresh } from "./use-job-refresh";

/** Says why TheFork matching is unavailable and lets the owner run it again; the page refreshes once the new Job ends. */
export function TheForkUnavailable({ slug, detail }: { slug: string; detail: string }) {
  const [jobId, setJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useJobRefresh(jobId, () => setJobId(null));

  async function searchAgain() {
    setError(null);
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}/thefork-match`, { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail ?? body?.title ?? "Could not search TheFork. Try again.");
      }
      setJobId(acceptedJobSchema.parse(await response.json()).id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not search TheFork. Try again.");
    }
  }

  return <div role="status">
    <p className="small muted">{detail}</p>
    <button type="button" className="btn" disabled={jobId !== null} onClick={() => void searchAgain()}>
      {jobId === null ? "Search TheFork again" : "Searching TheFork…"}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
