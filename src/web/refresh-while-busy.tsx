"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every 5 s while a Job is queued or running, so a follow-on Job (the re-judge after a Listing fetch) shows up without a manual refresh. */
export function RefreshWhileBusy({ status }: { status: string | null }) {
  const router = useRouter();
  const busy = status === "queued" || status === "running";
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [busy, router]);
  return null;
}
