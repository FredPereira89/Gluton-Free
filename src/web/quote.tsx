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
};

export function Quote(q: QuoteProps) {
  const [translated, setTranslated] = useState(false);
  const showing = translated && q.textEn ? q.textEn : q.text;
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
        <span className="tag">{q.aspectLabel}</span>
        {q.textEn && (
          <button className="tr" type="button" onClick={() => setTranslated((t) => !t)}>
            {translated ? "Original" : "Translate"}
          </button>
        )}
        {q.sourceUrl && (
          <a className="small" href={q.sourceUrl} rel="noreferrer nofollow" target="_blank" title={`Opens the Restaurant’s page on ${q.sourceName} (never the individual Review)`}>
            on {q.sourceName} ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}
