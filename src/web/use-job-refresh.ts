"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polls a Job every 5 s and refreshes the page once it has ended; `onEnded` runs first. Does nothing while `jobId` is null. */
export function useJobRefresh(jobId: number | null, onEnded: () => void) {
  const router = useRouter();
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
          onEnded();
          router.refresh();
          // A follow-on Job (the re-judge) is created a moment after this one ends: look again once it exists.
          setTimeout(() => router.refresh(), 3000);
          return;
        }
      } catch {
        // Keep polling: the page refreshes once the Job ends.
      }
      if (active) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
    // onEnded only clears local state; it must not restart the polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, router]);
}
