"use client";

import { useState } from "react";
import { acceptedJobSchema } from "@/lib/api-contract";
import { useJobRefresh } from "./use-job-refresh";

/** Lets the owner paste the TheFork page of a Restaurant that has no TheFork Listing; the page refreshes once the fetch Job ends. */
export function TheForkLink({ slug, busy }: { slug: string; busy: boolean }) {
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useJobRefresh(jobId, () => setJobId(null));

  async function add() {
    setError(null);
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}/thefork-link`, {
        method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail ?? body?.title ?? "Could not add the TheFork link. Try again.");
      }
      setJobId(acceptedJobSchema.parse(await response.json()).id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the TheFork link. Try again.");
    }
  }

  return <form onSubmit={(event) => { event.preventDefault(); void add(); }}>
    <p className="small muted">Paste this Restaurant's TheFork page to fetch its Reviews.</p>
    <label className="field">
      <span>TheFork URL</span>
      <input type="url" value={url} required placeholder="https://www.thefork.com/restaurant/name-r123456"
        onChange={(event) => setUrl(event.target.value)} disabled={busy || jobId !== null} />
    </label>{" "}
    <button type="submit" className="btn" disabled={busy || jobId !== null || url.trim() === ""}>
      {jobId === null ? "Add TheFork link" : "Fetching TheFork…"}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
