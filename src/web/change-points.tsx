"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHANGE_POINT_KINDS, CHANGE_POINT_LABEL, type ChangePointKind } from "@/domain/aspects";
import type { RestaurantBundle } from "@/lib/api-contract";

export function ChangePoints({ slug, items, disabled = false }: { slug: string; items: RestaurantBundle["changePoints"]; disabled?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<ChangePointKind>(CHANGE_POINT_KINDS[0]);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/restaurants/${encodeURIComponent(slug)}/change-points`;

  async function declare() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, date }),
        cache: "no-store",
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(problem?.detail ?? "Could not declare this Change point.");
      }
      setDate("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not declare this Change point.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, description: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${base}/${id}`, { method: "DELETE", cache: "no-store" });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(problem?.detail ?? `Could not delete the ${description} Change point.`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not delete the ${description} Change point.`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="ev-list">
    {items.map((point) => <div key={point.id}>
      {point.occurredOn}: {point.description}{" "}
      <button type="button" disabled={disabled || busy} onClick={() => void remove(point.id, point.description)}
        aria-label={`Delete ${point.description} Change point`}>Delete</button>
    </div>)}
    <p className="small muted">Only the newest Change point governs the Review window.</p>
    <form onSubmit={(event) => { event.preventDefault(); void declare(); }}>
      <label className="field">Kind
        <select value={kind} disabled={disabled || busy} onChange={(event) => setKind(event.target.value as ChangePointKind)}>
          {CHANGE_POINT_KINDS.map((k) => <option key={k} value={k}>{CHANGE_POINT_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="field">Date
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={disabled || busy} />
      </label>
      <button type="submit" className="btn" disabled={disabled || busy}>Declare Change point</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
