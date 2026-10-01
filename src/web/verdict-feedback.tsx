"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { VERDICT_FEEDBACK_JUDGEMENTS, VERDICT_FEEDBACK_LABELS } from "@/domain/verdict-feedback";
import { verdictFeedbackResponseSchema, type VerdictFeedback, type VerdictFeedbackJudgement } from "@/lib/api-contract";

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") return body.detail;
  return fallback;
}

function feedbackPath(slug: string): string {
  return `/api/v1/restaurants/${encodeURIComponent(slug)}/verdict-feedback`;
}

export function VerdictFeedback({ restaurantSlug, verdictId }: { restaurantSlug: string; verdictId: number }) {
  const id = useId();
  const [feedback, setFeedback] = useState<VerdictFeedback | null>(null);
  const [judgement, setJudgement] = useState<VerdictFeedbackJudgement | "">("");
  const [eatenHere, setEatenHere] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetch(feedbackPath(restaurantSlug), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessage(body, "Could not load your feedback."));
        return verdictFeedbackResponseSchema.parse(body).feedback;
      })
      .then((saved) => {
        if (controller.signal.aborted) return;
        setFeedback(saved);
        setJudgement(saved?.judgement ?? "");
        setEatenHere(saved?.eatenHere === true);
        setNote(saved?.note ?? "");
        setSavedMessage(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load your feedback.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [restaurantSlug, verdictId, reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!judgement || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const response = await fetch(feedbackPath(restaurantSlug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdictId, judgement, eatenHere: eatenHere ? true : null, note: note.trim() || null }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Could not save your feedback."));
      const saved = verdictFeedbackResponseSchema.parse(body).feedback;
      setFeedback(saved);
      setSavedMessage("Your feedback is saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save your feedback.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="verdict-feedback" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Is this Verdict right?</h2>
      <p className="small muted">Your answer helps the Owner understand where Invitees disagree. It never changes the Verdict.</p>
      {loading && <p className="small muted" role="status">Loading your feedback…</p>}
      {loadError && (
        <div>
          <p className="error" role="alert">{loadError}</p>
          <button className="btn btn-secondary" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button>
        </div>
      )}
      {!loading && !loadError && (
        <form className="verdict-feedback-form" onSubmit={submit}>
          {feedback && feedback.verdictId !== verdictId && (
            <p className="notice">Your saved feedback is about an earlier Verdict. Saving again attaches it to this Verdict.</p>
          )}
          <fieldset disabled={saving}>
            <legend>Choose one</legend>
            <div className="verdict-feedback-choices">
              {VERDICT_FEEDBACK_JUDGEMENTS.map((choice) => (
                <label key={choice}>
                  <input
                    type="radio"
                    name={`${id}-judgement`}
                    value={choice}
                    required
                    checked={judgement === choice}
                    onChange={() => setJudgement(choice)}
                  />
                  {VERDICT_FEEDBACK_LABELS[choice]}
                </label>
              ))}
            </div>
            <label className="verdict-feedback-eaten">
              <input type="checkbox" checked={eatenHere} onChange={(event) => setEatenHere(event.target.checked)} />
              I've eaten here
            </label>
            <label className="field" htmlFor={`${id}-note`}>
              Note (optional)
              <textarea id={`${id}-note`} value={note} maxLength={1000} rows={3}
                onChange={(event) => setNote(event.target.value)} />
            </label>
          </fieldset>
          {feedback && <p className="small muted">Last saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(feedback.submittedAt))}. You can change it any time.</p>}
          {saveError && <p className="error" role="alert">{saveError}</p>}
          {savedMessage && <p className="small" role="status">{savedMessage}</p>}
          <button className="btn" type="submit" disabled={!judgement || saving}>
            {saving ? "Saving…" : feedback ? "Update feedback" : "Send feedback"}
          </button>
        </form>
      )}
    </section>
  );
}
