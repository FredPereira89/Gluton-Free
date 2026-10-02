"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { feedbackCreatedResponseSchema, type GeneralFeedbackSubmission } from "@/lib/api-contract";

function detailFrom(body: unknown): string | null {
  return body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : null;
}

async function sendFeedback(input: GeneralFeedbackSubmission): Promise<void> {
  const response = await fetch("/api/v1/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(detailFrom(body) ?? "Could not send feedback. Try again.");
  feedbackCreatedResponseSchema.parse(body);
}

type FeedbackWidgetProps =
  | { kind?: "general"; buttonLabel?: string }
  | { kind: "restaurant_issue"; buttonLabel?: string; restaurantSlug: string };

export function FeedbackWidget(props: FeedbackWidgetProps) {
  const kind = props.kind ?? "general";
  const buttonLabel = props.buttonLabel ?? "Feedback";
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLSummaryElement>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (disclosure.current?.open && target instanceof Node && !disclosure.current.contains(target)) {
        disclosure.current.open = false;
      }
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function closeOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !disclosure.current?.open) return;
    event.preventDefault();
    disclosure.current.open = false;
    trigger.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    setSent(false);
    try {
      const pagePath = window.location.pathname;
      const input: GeneralFeedbackSubmission = props.kind === "restaurant_issue"
        ? { kind: "restaurant_issue", pagePath, restaurantSlug: props.restaurantSlug, message: text }
        : { kind: "general", pagePath, message: text };
      await sendFeedback(input);
      setMessage("");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send feedback. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details ref={disclosure} className="feedback-widget" onKeyDown={closeOnEscape}>
      <summary ref={trigger} className="btn btn-secondary">{buttonLabel}</summary>
      <form className="feedback-widget-panel" onSubmit={submit}>
        <label className="field" htmlFor={`${id}-message`}>
          {kind === "restaurant_issue" ? "What seems wrong?" : "What would you like us to know?"}
          <textarea id={`${id}-message`} value={message} maxLength={2000} rows={3} required
            onChange={(event) => setMessage(event.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {sent && <p className="small" role="status">Sent to the Owner. Thank you.</p>}
        <button className="btn" type="submit" disabled={!message.trim() || saving}>
          {saving ? "Sending…" : "Send feedback"}
        </button>
      </form>
    </details>
  );
}

export function MissingRestaurantRequest({ query }: { query: string }) {
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestRestaurant() {
    if (saving || sent || !query.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await sendFeedback({ kind: "missing_restaurant", pagePath: window.location.pathname, message: query.trim() });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the request. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="missing-restaurant-request">
      <button className="btn btn-secondary" type="button" disabled={saving || sent} onClick={() => void requestRestaurant()}>
        {saving ? "Sending…" : sent ? "Request sent" : "Missing a Restaurant? Tell us"}
      </button>
      {sent && <p className="small" role="status">We sent “{query}” to the Owner.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
