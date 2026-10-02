import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SPOT_CHECK_BARS, SPOT_CHECK_TARGETS, spotCheckRate, spotCheckState, type SpotCheckItem, type SpotCheckKind } from "@/lib/baseline-spot-check";
import { ExternalIcon } from "@/web/icons";
import { SpotCheckActions, StartSpotCheck } from "@/web/baseline-spot-checks";

export const metadata: Metadata = { title: "Baseline spot checks · Gluton-Free", robots: { index: false, follow: false } };

const headings: Record<SpotCheckKind, string> = { format: "Formats", tripadvisor_match: "Tripadvisor matches" };
const views = ["pending", "all", "confirmed", "rejected"] as const;
type View = (typeof views)[number];

function httpsUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}

function Check({ item, nextPendingId }: { item: SpotCheckItem; nextPendingId: number | null }) {
  const googleUrl = httpsUrl(item.googleUrl);
  const tripadvisorUrl = httpsUrl(item.tripadvisorUrl);
  return (
    <li className="spot-item" id={`check-${item.id}`}>
      <div className="spot-head">
        <div>
          <strong>{item.name}</strong>
          <p className="small muted">{item.address ?? "Address unavailable"}</p>
        </div>
        <span className="chip">{item.agreed === null ? "Pending" : item.agreed ? "Confirmed" : "Rejected"}</span>
      </div>
      {item.kind === "format" ? (
        <>
          <p>Proposed Format: <strong>{item.proposedFormat?.replaceAll("_", " ")}</strong></p>
          {item.categories.length > 0 && <p className="small muted">Google categories: {item.categories.join(", ")}</p>}
          {item.reviews.length > 0 && <ul className="spot-reviews">{item.reviews.map((review, i) => <li key={i}>“{review}”</li>)}</ul>}
        </>
      ) : <p className="small muted">Compare the Google and Tripadvisor Listings for the same Restaurant.</p>}
      <div className="spot-links">
        <Link href={`/r/${encodeURIComponent(item.slug)}`}>Restaurant</Link>
        {googleUrl && <a href={googleUrl} target="_blank" rel="noopener noreferrer">Google Listing<ExternalIcon /></a>}
        {tripadvisorUrl && <a href={tripadvisorUrl} target="_blank" rel="noopener noreferrer">Tripadvisor Listing<ExternalIcon /></a>}
      </div>
      <SpotCheckActions id={item.id} nextPendingId={nextPendingId} />
    </li>
  );
}

export default async function BaselineChecksPage({ searchParams }: { searchParams: Promise<{ view?: string; saved?: string }> }) {
  await connection();
  const [{ view: requestedView, saved }, { items, available }] = await Promise.all([searchParams, spotCheckState()]);
  const view: View = views.includes(requestedView as View) ? requestedView as View : "pending";
  const visible = (item: SpotCheckItem) => view === "all"
    || (view === "pending" && item.agreed === null)
    || (view === "confirmed" && item.agreed === true)
    || (view === "rejected" && item.agreed === false);
  const viewCounts = {
    pending: items.filter((item) => item.agreed === null).length,
    all: items.length,
    confirmed: items.filter((item) => item.agreed === true).length,
    rejected: items.filter((item) => item.agreed === false).length,
  };
  const nextPending = items.find((item) => item.agreed === null);
  const savedAnswer = requestedView === "pending" ? saved : undefined;
  const started = items.length > 0;
  return (
    <section className="spot-checks">
      <h1>Baseline spot checks</h1>
      <p className="muted">Confirm or reject 50 sampled Formats and 30 sampled Tripadvisor matches. Answers are saved as you go.</p>
      {!started && <div className="spot-start">
        <p>Available: {available.format} confirmed baseline Formats; {available.tripadvisor_match} automatic Tripadvisor matches.</p>
        {available.format >= SPOT_CHECK_TARGETS.format && available.tripadvisor_match >= SPOT_CHECK_TARGETS.tripadvisor_match
          ? <StartSpotCheck />
          : <p className="muted">Run the Lisbon baseline first. The checklist needs at least 50 Formats and 30 Tripadvisor matches.</p>}
      </div>}
      {started && <>
        <p className="spot-progress">{viewCounts.pending} of {items.length} checks remain. Answers can be changed later.</p>
        {(savedAnswer === "confirmed" || savedAnswer === "rejected") && <p className="spot-saved" role="status">Answer {savedAnswer}. {nextPending ? <Link href={`/baseline-checks?view=pending#check-${nextPending.id}`}>Next pending check</Link> : "All checks answered."}</p>}
        <nav className="spot-filters" aria-label="Filter spot checks">
          {views.map((option) => <Link key={option} href={`/baseline-checks?view=${option}`} aria-current={view === option ? "page" : undefined}>
            {option === "all" ? "All" : option[0]!.toUpperCase() + option.slice(1)} ({viewCounts[option]})
          </Link>)}
          {nextPending && <Link className="spot-next" href={`/baseline-checks?view=pending#check-${nextPending.id}`}>Next pending check</Link>}
        </nav>
      </>}
      {started && (["format", "tripadvisor_match"] as const).map((kind) => {
        const result = spotCheckRate(items, kind);
        return <section key={kind} className="spot-group" id={kind}>
          <h2>{headings[kind]}</h2>
          <p className="spot-rate">
            {result.confirmed}/{result.answered} confirmed · {result.rate === null ? "No answers yet" : `${result.rate}% agreement`}
            {` · bar ≥${SPOT_CHECK_BARS[kind]}%`}
            {result.complete && <strong className={result.passes ? "spot-pass" : "spot-fail"}>{result.passes ? " Pass" : " Below bar"}</strong>}
          </p>
          <p className="small muted">{result.answered}/{result.sampled} answered. {result.complete ? "Complete." : "Acceptance result pending until the full sample is answered."}</p>
          {items.some((item) => item.kind === kind && visible(item))
            ? <ol className="spot-list">{items.filter((item) => item.kind === kind && visible(item)).map((item) => <Check key={item.id} item={item} nextPendingId={items.find((candidate) => candidate.agreed === null && candidate.id !== item.id)?.id ?? null} />)}</ol>
            : <p className="small muted">No {view === "pending" ? "pending" : view} checks here.</p>}
        </section>;
      })}
    </section>
  );
}
