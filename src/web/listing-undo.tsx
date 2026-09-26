"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ListingUndo({ slug, source, disabled = false }: { slug: string; source: string; disabled?: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}/listings/${encodeURIComponent(source)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail ?? body?.title ?? "Could not undo this Listing. Try again.");
      }
      setAccepted(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not undo this Listing. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <button type="button" className="btn btn-secondary" disabled={disabled || submitting || accepted}
      aria-label={`Undo automatically accepted ${source} Listing`}
      onClick={() => void undo()}>
      {submitting ? "Undoing…" : accepted ? "Undo queued" : "Undo"}
    </button>
    {error && <span className="error" role="alert">{error}</span>}
    {accepted && <span className="small muted" role="status">Updating Verdict…</span>}
  </>;
}
