import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SPOT_CHECK_BARS, SPOT_CHECK_TARGETS, spotCheckRate, spotCheckState, type SpotCheckItem, type SpotCheckKind } from "@/lib/baseline-spot-check";

export const metadata: Metadata = { title: "Baseline spot checks · Gluton-Free", robots: { index: false, follow: false } };

const headings: Record<SpotCheckKind, string> = { format: "Formats", tripadvisor_match: "Tripadvisor matches" };

function httpsUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}

function Check({ item }: { item: SpotCheckItem }) {
  const googleUrl = httpsUrl(item.googleUrl);
  const tripadvisorUrl = httpsUrl(item.tripadvisorUrl);
  return (
    <li className="spot-item" id={`check-${item.id}`}>
      <div className="spot-head">
        <div>
          <strong>{item.name}</strong>
          <p className="small muted">{item.address ?? "Address unavailable"}</p>
        </div>
        <span className="small">{item.agreed === null ? "Pending" : item.agreed ? "Confirmed" : "Rejected"}</span>
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
        {googleUrl && <a href={googleUrl} target="_blank" rel="noopener noreferrer">Google Listing ↗</a>}
        {tripadvisorUrl && <a href={tripadvisorUrl} target="_blank" rel="noopener noreferrer">Tripadvisor Listing ↗</a>}
      </div>
      <form action="/baseline-checks/answer" method="post" className="spot-actions">
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" name="answer" value="confirm" className="btn">Confirm</button>
        <button type="submit" name="answer" value="reject" className="btn btn-secondary">Reject</button>
      </form>
    </li>
  );
}

export default async function BaselineChecksPage() {
  await connection();
  const { items, available } = await spotCheckState();
  const started = items.length > 0;
  return (
    <section className="spot-checks">
      <h1>Baseline spot checks</h1>
      <p className="muted">Confirm or reject 50 sampled Formats and 30 sampled Tripadvisor matches. Answers are saved as you go.</p>
      {!started && <div className="spot-start">
        <p>Available: {available.format} confirmed baseline Formats; {available.tripadvisor_match} automatic Tripadvisor matches.</p>
        {available.format >= SPOT_CHECK_TARGETS.format && available.tripadvisor_match >= SPOT_CHECK_TARGETS.tripadvisor_match
          ? <form action="/baseline-checks/start" method="post"><button className="btn" type="submit">Draw random checklist</button></form>
          : <p className="muted">Run the Lisbon baseline first. The checklist needs at least 50 Formats and 30 Tripadvisor matches.</p>}
      </div>}
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
          <ol className="spot-list">{items.filter((item) => item.kind === kind).map((item) => <Check key={item.id} item={item} />)}</ol>
        </section>;
      })}
    </section>
  );
}
