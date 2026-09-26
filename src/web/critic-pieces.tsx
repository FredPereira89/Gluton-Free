"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RestaurantBundle } from "@/lib/api-contract";

export function CriticPieces({ slug, items }: { slug: string; items: RestaurantBundle["critics"] }) {
  const router = useRouter();
  const [publication, setPublication] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [publishedOn, setPublishedOn] = useState("");
  const [language, setLanguage] = useState("");
  const [printedRating, setPrintedRating] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/v1/restaurants/${encodeURIComponent(slug)}/critic-pieces`;

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
        throw new Error(problem?.detail ?? "Could not save critic piece.");
      }
      if (method === "POST") {
        setPublication("");
        setTitle("");
        setUrl("");
        setPublishedOn("");
        setLanguage("");
        setPrintedRating("");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save critic piece.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="ev-list">
    {items.map((item) => <div key={item.id}>
      <b>{item.publication}</b> ·{" "}
      <a href={item.url} rel="noreferrer" target="_blank">“{item.title}” ↗</a>
      {item.publishedOn && ` · ${item.publishedOn}`}
      {item.language && ` · ${item.language}`}
      {item.printedRating && ` · ${item.printedRating} (printed rating)`}{" "}
      <button type="button" disabled={busy} onClick={() => void send("DELETE", { id: item.id })} aria-label={`Delete ${item.title} by ${item.publication}`}>Delete</button>
    </div>)}
    <p className="small muted">Critic pieces are credited to their publication and never move the Tier.</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      void send("POST", {
        publication, title, url, publishedOn: publishedOn || null,
        language: language || null, printedRating: printedRating || null,
      });
    }}>
      <label className="field">Publication
        <input value={publication} onChange={(event) => setPublication(event.target.value)} required maxLength={160} disabled={busy} />
      </label>
      <label className="field">Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={240} disabled={busy} />
      </label>
      <label className="field">Piece link
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required disabled={busy} />
      </label>
      <label className="field">Publication date
        <input type="date" value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} disabled={busy} />
      </label>
      <label className="field">Language
        <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="pt or pt-PT" maxLength={35} disabled={busy} />
      </label>
      <label className="field">Printed rating
        <input value={printedRating} onChange={(event) => setPrintedRating(event.target.value)} placeholder="As printed, e.g. 4/5" maxLength={80} disabled={busy} />
      </label>
      <button type="submit" className="btn" disabled={busy}>Add critic piece</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
