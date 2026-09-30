"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptedJobSchema } from "@/lib/api-contract";

/** Says why TheFork matching is unavailable and lets the owner run it again; the page refreshes once the new Job ends. */
export function TheForkUnavailable({ slug, detail }: { slug: string; detail: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId === null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await fetch(`/api/v1/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Job unavailable");
        const job = await response.json() as { status?: string };
        if (!active) return;
        if (job.status === "succeeded" || job.status === "failed") {
          setJobId(null);
          router.refresh();
          return;
        }
      } catch {
        // Keep polling: the page refreshes once the Job ends.
      }
      if (active) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [jobId, router]);

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
