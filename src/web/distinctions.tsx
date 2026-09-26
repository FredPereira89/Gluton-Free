"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RestaurantBundle } from "@/lib/api-contract";

export function Distinctions({ slug, items }: { slug: string; items: RestaurantBundle["distinctions"] }) {
  const router = useRouter();
  const [guide, setGuide] = useState<"Michelin" | "Guia Repsol">("Michelin");
  const [level, setLevel] = useState("");
  const [editionYear, setEditionYear] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/v1/restaurants/${encodeURIComponent(slug)}/distinctions`;

  async function send(method: "POST" | "DELETE", body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(problem?.detail ?? "Could not save Distinction.");
      }
      if (method === "POST") {
        setLevel("");
        setEditionYear("");
        setUrl("");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Distinction.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="ev-list">
    {items.map((item) => <div key={item.id}>
      <b>{item.guide}</b> · {item.level}{item.editionYear === null ? "" : ` (${item.editionYear})`}{" "}
      <a href={item.url} rel="noreferrer" target="_blank">↗</a>{" "}
      <button type="button" disabled={busy} onClick={() => void send("DELETE", { id: item.id })} aria-label={`Delete ${item.guide} ${item.level}${item.editionYear === null ? "" : ` ${item.editionYear}`}`}>Delete</button>
    </div>)}
    <p className="small muted">Distinctions are credited to their guide and never move the Tier.</p>
    <form onSubmit={(event) => { event.preventDefault(); void send("POST", { guide, level, editionYear: Number(editionYear), url }); }}>
      <label className="field">Guide
        <select value={guide} disabled={busy} onChange={(event) => setGuide(event.target.value as "Michelin" | "Guia Repsol")}>
          <option>Michelin</option><option>Guia Repsol</option>
        </select>
      </label>
      <label className="field">Level
        <input value={level} onChange={(event) => setLevel(event.target.value)} required maxLength={120} disabled={busy} />
      </label>
      <label className="field">Edition year
        <input type="number" min="1900" max="2100" value={editionYear} onChange={(event) => setEditionYear(event.target.value)} required disabled={busy} />
      </label>
      <label className="field">Guide link
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required disabled={busy} />
      </label>
      <button type="submit" className="btn" disabled={busy}>Add Distinction</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
