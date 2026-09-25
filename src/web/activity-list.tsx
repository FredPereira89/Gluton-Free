// The home screen's Activity list (issue #52): Running jobs, unseen Verdicts and open Owner questions.
import Link from "next/link";
import type { ActivityResponse } from "@/lib/api-contract";
import { TierBadge } from "@/web/atoms";

export function ActivityList({ activity }: { activity: ActivityResponse }) {
  const { running, ready, questions } = activity;
  if (!running.length && !ready.length && !questions.length) return null;

  return (
    <section className="activity-list">
      {!!running.length && (
        <div className="search-group">
          <h2>Running</h2>
          {running.map((item) => (
            <Link className="search-result" href={`/r/${encodeURIComponent(item.slug)}`} key={item.slug}>
              <strong>{item.name}</strong>
              <span className="small muted">{item.step ?? (item.status === "queued" ? "Queued" : "Running…")}</span>
            </Link>
          ))}
        </div>
      )}
      {!!ready.length && (
        <div className="search-group">
          <h2>Ready (new)</h2>
          {ready.map((item) => (
            <Link className="search-result" href={`/r/${encodeURIComponent(item.slug)}`} key={item.slug}>
              <strong>{item.name}</strong>
              {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="nee">Not enough evidence</span>}
            </Link>
          ))}
        </div>
      )}
      {!!questions.length && (
        <div className="search-group">
          <h2>Needs you</h2>
          {questions.map((item) => (
            <Link className="search-result" href={`/r/${encodeURIComponent(item.slug)}`} key={item.slug}>
              <strong>{item.name}</strong>
              <span className="small muted">{item.count} question{item.count === 1 ? "" : "s"}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
