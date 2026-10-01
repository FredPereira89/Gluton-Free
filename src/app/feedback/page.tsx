import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { TIER_LABEL } from "@/domain/aspects";
import { listVerdictFeedbackInbox, type VerdictFeedbackInboxGroup } from "@/lib/verdict-feedback";

export const metadata: Metadata = { title: "Verdict feedback · Gluton-Free" };

export default async function VerdictFeedbackInboxPage() {
  await connection();
  const groups = await listVerdictFeedbackInbox();
  return (
    <div className="feedback-inbox">
      <h1>Verdict feedback</h1>
      <p className="small muted">Invitee feedback, grouped by Restaurant and the Tier they answered about.</p>
      {groups.length === 0 ? (
        <p className="feedback-empty">No Verdict feedback yet.</p>
      ) : groups.map((group) => <FeedbackGroup key={`${group.restaurantSlug}-${group.tier}`} group={group} />)}
      <Link href="/settings">Settings</Link>
    </div>
  );
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
              <strong>{entry.email ?? "Invitee"}</strong>
              <time dateTime={entry.submittedAt}>{new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon",
              }).format(new Date(entry.submittedAt))}</time>
            </div>
            <p>{entry.judgement === "too_high" ? "Thinks the Verdict is too high" : entry.judgement === "too_low" ? "Thinks the Verdict is too low" : "Thinks the Verdict is about right"}</p>
            {entry.eatenHere === true && <p className="small muted">I've eaten here</p>}
            {entry.eatenHere === false && <p className="small muted">Has not eaten here</p>}
            {entry.note && <p className="feedback-note">{entry.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
