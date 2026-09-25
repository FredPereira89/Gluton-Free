"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OwnerQuestion } from "@/lib/api-contract";

function formatDistance(meters: number | null): string {
  if (meters === null) return "Distance unavailable";
  return meters < 1000 ? `${meters} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

export function OwnerQuestions({ slug, questions }: { slug: string; questions: OwnerQuestion[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<number | null>(null);

  async function answer(question: OwnerQuestion, selection: { answer: "accept"; placeRef: string } | { answer: "none" }) {
    setSubmitting(question.id);
    setError(null);
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}/listings/${encodeURIComponent(question.source)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selection),
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail ?? body?.title ?? "Could not save your answer. Try again.");
      }
      setSubmitting(null);
      setSettled(question.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your answer. Try again.");
      setSubmitting(null);
    }
  }

  return <div className="owner-questions" aria-live="polite">
    {questions.map((question) => (
      <article className="owner-question" key={question.id}>
        <h3>{question.prompt}</h3>
        <ul className="owner-question-candidates">
          {question.candidates.map((candidate) => {
            const distance = candidate.evidence.distanceMeters;
            const phoneMatch = candidate.evidence.phoneMatch;
            const phone = phoneMatch === null ? "Phone match unavailable" : phoneMatch ? "Phone matches" : "Phone differs";
            const evidence = [
              formatDistance(distance),
              phone,
              `Name match ${Math.round(candidate.evidence.nameSimilarity * 100)}%`,
            ].join(" · ");
            return <li className="owner-question-candidate" key={candidate.placeRef}>
              <div>
                <a href={candidate.url} target="_blank" rel="noreferrer">
                  {candidate.name} <span aria-hidden="true">↗</span>
                </a>
                <p className="small muted">{evidence}</p>
              </div>
              <button type="button" className="btn" disabled={submitting !== null || settled !== null}
                onClick={() => void answer(question, { answer: "accept", placeRef: candidate.placeRef })}>
                Use this listing
              </button>
            </li>;
          })}
        </ul>
        <button type="button" className="btn btn-secondary" disabled={submitting !== null || settled !== null}
          onClick={() => void answer(question, { answer: "none" })}>
          Neither is the right listing
        </button>
        {submitting === question.id && <p className="small muted" role="status">Saving your answer…</p>}
        {settled === question.id && <p className="small muted" role="status">Answer saved. Refreshing the Restaurant page…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </article>
    ))}
  </div>;
}
