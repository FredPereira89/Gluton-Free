"use client";
// A quote with a Translate toggle. Links go to the Restaurant's page on the Source, never to
// the individual Review.
import { useState } from "react";

export type QuoteProps = {
  text: string;
  textEn: string | null;
  lang: string | null;
  stars: number | null;
  sourceName: string;
  sourceUrl: string | null;
  month: string;
  aspectLabel: string;
  negative: boolean;
  reviewId: number;
  restaurantSlug: string;
  access?: "public_ok" | "personal_only";
};

export function Quote(q: QuoteProps) {
  const [translated, setTranslated] = useState(false);
  const [textEn, setTextEn] = useState(q.textEn);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const showing = translated && textEn ? textEn : q.text;
  async function toggleTranslation() {
    if (translated) { setTranslated(false); return; }
    if (textEn) { setTranslated(true); return; }
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(q.restaurantSlug)}/quotes/${q.reviewId}/translation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ original: q.text }),
      });
      if (!response.ok) throw new Error("Translation unavailable");
      const body = await response.json() as { textEn: string };
      setTextEn(body.textEn);
      setTranslated(true);
    } catch { setError(true); }
    finally { setLoading(false); }
  }
  return (
    <figure className={`quote ${q.negative ? "neg" : ""}`} style={{ margin: 0 }}>
      <blockquote lang={translated ? "en" : (q.lang ?? undefined)}>“{showing}”</blockquote>
      <figcaption className="meta">
        {q.lang && <span className="lang">{(translated ? "en" : q.lang).toUpperCase()}</span>}
        {q.stars !== null && (
          <span className="stars" aria-label={`${q.stars} stars`}>
            {"★".repeat(q.stars)}
            <span style={{ opacity: 0.25 }}>{"★".repeat(5 - q.stars)}</span>
          </span>
        )}
        <span>
          {q.sourceName} · {q.month}
        </span>
        {q.access && <span className={`acc ${q.access === "personal_only" ? "personal" : "public"}`}>{q.access === "personal_only" ? "Personal only" : "Public OK"}</span>}
        <span className="tag">{q.aspectLabel}</span>
        {!q.lang?.startsWith("en") && <button className="tr" type="button" disabled={loading} onClick={toggleTranslation}>{loading ? "Translating…" : translated ? "Original" : "Translate"}</button>}
        {error && <span role="alert">Translation unavailable. Try again.</span>}
        {q.sourceUrl && (
          <a className="small" href={q.sourceUrl} rel="noreferrer nofollow" target="_blank" title={`Opens the Restaurant’s page on ${q.sourceName} (never the individual Review)`}>
            on {q.sourceName} ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}
