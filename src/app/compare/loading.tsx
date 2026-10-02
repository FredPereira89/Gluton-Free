"use client";

import { useSearchParams } from "next/navigation";
import { shortlistSlugs } from "@/lib/shortlist";

export default function Loading() {
  // One placeholder per Restaurant being compared (two or three), so the page does not jump when it arrives.
  const count = Math.max(2, shortlistSlugs(useSearchParams().getAll("r")).length);
  return (
    <div className="skeleton-page" role="status" aria-busy="true">
      <span className="sr-only">Loading the comparison</span>
      <div className="skel skel-title" aria-hidden="true" />
      <div className="compare-loading-row" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <div key={i} className="skel skel-card" />)}
      </div>
    </div>
  );
}
