"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OwnerQuestion } from "@/lib/api-contract";
import { acceptedJobSchema } from "@/lib/api-contract";
import { CHANGE_POINT_LABEL } from "@/domain/aspects";

function ChangePointQuestion({ slug, question }: { slug: string; question: Extract<OwnerQuestion, { kind: "change_point" }> }) {
  const router = useRouter();
  const [date, setDate] = useState(question.proposedDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function settle(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = confirm
        ? await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}/change-points`, {
            method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ kind: question.proposedKind, date, questionId: question.id }),
          })
        : await fetch(`/api/v1/owner-questions/${question.id}/reject-change-point`, { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Could not save your answer. Try again.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your answer. Try again.");
      setBusy(false);
    }
  }

  return <article className="owner-question">
    <h3>{question.prompt}</h3>
    <p className="small muted">Proposed: {CHANGE_POINT_LABEL[question.proposedKind]} ({question.reason === "gap" ? "Review gap" : `${question.mentionCount} Review mentions`}).</p>
    <label className="field">Change date
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={busy} />
    </label>
    <button type="button" className="btn" disabled={busy || !date} onClick={() => void settle(true)}>Confirm and re-judge</button>{" "}
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void settle(false)}>Reject proposal</button>
    {busy && <p className="small muted" role="status">Saving your answer…</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </article>;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "Distance unavailable";
  return meters < 1000 ? `${meters} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

export function OwnerQuestions({ slug, questions }: { slug: string; questions: OwnerQuestion[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<number | null>(null);

  async function answer(question: Extract<OwnerQuestion, { kind: "listing_match" }>, selection: { answer: "accept"; placeRef: string } | { answer: "none" }) {
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

  async function keepProposedFormat(question: Extract<OwnerQuestion, { kind: "format" }>) {
    setSubmitting(question.id);
    setError(null);
    try {
      const response = await fetch(`/api/v1/owner-questions/${question.id}/dismiss`, {
        method: "POST",
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
    {questions.filter((question) => question.kind !== "retry_source").map((question) => question.kind === "change_point" ? (
      <ChangePointQuestion key={question.id} slug={slug} question={question} />
    ) : question.kind === "format" ? (
      <article className="owner-question" key={question.id}>
        <h3>{question.prompt}</h3>
        <p className="small muted">Proposed Format: <strong>{question.proposedFormat.replaceAll("_", " ")}</strong></p>
        <button type="button" className="btn btn-secondary" disabled={submitting !== null || settled !== null}
          onClick={() => void keepProposedFormat(question)}>
          Keep proposed Format
        </button>
        {submitting === question.id && <p className="small muted" role="status">Saving your answer…</p>}
        {settled === question.id && <p className="small muted" role="status">Format saved. Refreshing the Restaurant page…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </article>
    ) : (
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

export function SourceRetryBanners({ slug, questions }: { slug: string; questions: OwnerQuestion[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeJobId === null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await fetch(`/api/v1/jobs/${activeJobId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Job unavailable");
        const job = await response.json() as { status?: string };
        if (!active) return;
        if (job.status === "succeeded" || job.status === "failed") {
          setActiveJobId(null);
          router.refresh();
        } else {
          timer = setTimeout(() => void poll(), 5000);
        }
      } catch {
        if (active) timer = setTimeout(() => void poll(), 5000);
      }
    }
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [activeJobId, router]);

  async function retry(question: Extract<OwnerQuestion, { kind: "retry_source" }>) {
    setSubmitting(question.id);
    setError(null);
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}/listings/${encodeURIComponent(question.source)}/retry`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail ?? body?.title ?? "Could not retry this Source. Try again.");
      }
      const accepted = acceptedJobSchema.parse(await response.json());
      setActiveJobId(accepted.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry this Source. Try again.");
    } finally {
      setSubmitting(null);
    }
  }

  const retryQuestions = questions.filter((question): question is Extract<OwnerQuestion, { kind: "retry_source" }> => question.kind === "retry_source");
  if (!retryQuestions.length) return null;
  return <div className="source-retry-banners" aria-live="polite">
    {retryQuestions.map((question) => {
      const sourceName = question.prompt.replace(/^Retry /, "");
      return <section className="banner source-retry-banner" key={question.id} role="alert">
        <p><strong>{sourceName} could not be fetched.</strong> This Source is missing from the Review window. Retry it to include its Reviews in a new Verdict.</p>
        <button type="button" className="btn" disabled={submitting !== null || activeJobId !== null}
          onClick={() => void retry(question)}>
          {submitting === question.id || activeJobId !== null ? `Retrying ${sourceName}…` : question.prompt}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>;
    })}
  </div>;
}
