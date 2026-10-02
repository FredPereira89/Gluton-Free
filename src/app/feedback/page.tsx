import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { TIER_LABEL } from "@/domain/aspects";
import { VERDICT_FEEDBACK_LABELS } from "@/domain/verdict-feedback";
import { listVerdictFeedbackInbox, type VerdictFeedbackInboxGroup } from "@/lib/verdict-feedback";
import { listGeneralFeedbackInbox, type GeneralFeedbackInboxItem } from "@/lib/general-feedback";

export const metadata: Metadata = { title: "Verdict feedback · Gluton-Free" };

export default async function VerdictFeedbackInboxPage() {
  await connection();
  const [groups, feedback] = await Promise.all([listVerdictFeedbackInbox(), listGeneralFeedbackInbox()]);
  return (
    <div className="feedback-inbox">
      <h1>Feedback inbox</h1>
      <section className="feedback-verdict" aria-labelledby="verdict-feedback-heading">
        <h2 id="verdict-feedback-heading">Verdict feedback</h2>
        <p className="small muted">Invitee feedback, grouped by Restaurant and the Tier they answered about.</p>
        {groups.length === 0 ? (
          <p className="feedback-empty">No Verdict feedback yet.</p>
        ) : groups.map((group) => <FeedbackGroup key={`${group.restaurantSlug}-${group.tier}`} group={group} />)}
      </section>
      <GeneralFeedback entries={feedback} />
      <Link href="/settings">Settings</Link>
    </div>
  );
}

function GeneralFeedback({ entries }: { entries: GeneralFeedbackInboxItem[] }) {
  return (
    <section className="feedback-general" aria-labelledby="other-feedback-heading">
      <h2 id="other-feedback-heading">Feedback and requests</h2>
      <p className="small muted">General feedback, missing Restaurant requests, and Restaurant reports.</p>
      {entries.length === 0 ? <p className="feedback-empty">No other feedback yet.</p> : (
        <ul className="feedback-entries">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="feedback-entry-heading">
                <strong>{entry.senderRole === "owner" ? "Owner" : entry.email ?? `Invitee ${entry.userId.slice(0, 8)}`}</strong>
                <time dateTime={entry.submittedAt}>{formatFeedbackTime(entry.submittedAt)}</time>
              </div>
              <p className="small muted">{feedbackKindLabel(entry.kind)} · From {entry.pagePath}</p>
              {entry.restaurantSlug && entry.restaurantName && (
                <p className="small"><Link href={`/r/${encodeURIComponent(entry.restaurantSlug)}`}>{entry.restaurantName}</Link></p>
              )}
              <p className="feedback-note">{entry.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function feedbackKindLabel(kind: GeneralFeedbackInboxItem["kind"]): string {
  switch (kind) {
    case "general": return "General feedback";
    case "missing_restaurant": return "Missing Restaurant request";
    case "restaurant_issue": return "Restaurant report";
  }
}

function formatFeedbackTime(submittedAt: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon",
  }).format(new Date(submittedAt));
}

function FeedbackGroup({ group }: { group: VerdictFeedbackInboxGroup }) {
  return (
    <section className="feedback-group" aria-labelledby={`${group.restaurantSlug}-${group.tier}`}>
      <div className="feedback-group-heading">
        <h2 id={`${group.restaurantSlug}-${group.tier}`}><Link href={`/r/${encodeURIComponent(group.restaurantSlug)}`}>{group.restaurantName}</Link></h2>
        <span className="chip">{TIER_LABEL[group.tier]}</span>
      </div>
      <p className="feedback-counts" aria-label="Feedback counts">
        <strong>{group.total} {group.total === 1 ? "response" : "responses"}</strong>
        <span>{group.counts.too_high} too high</span>
        <span>{group.counts.about_right} about right</span>
        <span>{group.counts.too_low} too low</span>
      </p>
      <ul className="feedback-entries">
        {group.entries.map((entry, index) => (
          <li key={`${entry.email ?? "invitee"}-${entry.submittedAt}-${index}`}>
            <div className="feedback-entry-heading">
              <strong>{entry.email ?? `Invitee ${entry.userId.slice(0, 8)}`}</strong>
              <time dateTime={entry.submittedAt}>{formatFeedbackTime(entry.submittedAt)}</time>
            </div>
            <p>Thinks the Verdict is {VERDICT_FEEDBACK_LABELS[entry.judgement].toLowerCase()}</p>
            {entry.eatenHere === true && <p className="small muted">I've eaten here</p>}
            {entry.eatenHere === false && <p className="small muted">Has not eaten here</p>}
            {entry.note && <p className="feedback-note">{entry.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
