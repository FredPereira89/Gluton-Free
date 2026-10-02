// Compare keeps the diner's shortlist order and aligns the same facts across Restaurants.
// Every Verdict and its Review themes are read fresh from the server.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DIET_LABEL } from "@/domain/dish-dietary";
import type { DirectoryItem } from "@/lib/api-contract";
import { parseDirectoryQuery } from "@/lib/api-contract";
import { safeDirectoryReturn } from "@/lib/directory-url";
import { SHORTLIST_LIMIT, comparisonHref, shortlistSlugs } from "@/lib/shortlist";
import { pageRole } from "@/lib/page-role";
import { ConfChip, DietIcon, TierBadge, TrendChip } from "@/web/atoms";
import { loadCompareEvidence, loadDirectory, type CompareEvidence } from "@/web/data";
import { ExternalIcon } from "@/web/icons";
import { CompareRemove } from "@/web/shortlist";
import { UsageTrackedLink } from "@/web/usage-tracking";

export const metadata: Metadata = { title: "Compare · Gluton-Free", robots: { index: false, follow: false } };

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type Item = DirectoryItem;
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const emptyEvidence: CompareEvidence = { strengths: [], warnings: [], redFlags: [] };

function CompareRow({ label, items, children, className = "" }: {
  label: string; items: Item[]; children: (item: Item) => React.ReactNode; className?: string;
}) {
  return <tr className={className}>
    <th scope="row" className="compare-row-label">{label}</th>
    {items.map((item) => <td key={item.slug}>{children(item)}</td>)}
  </tr>;
}

function ThemeList({ themes, empty, redFlags = [] }: {
  themes: CompareEvidence["strengths"]; empty: string; redFlags?: string[];
}) {
  if (!themes.length && !redFlags.length) return <span className="muted">{empty}</span>;
  return <ul className="compare-themes">
    {redFlags.map((flag) => <li className="compare-red-flag" key={flag}><strong>Red flag</strong><span>{flag}</span></li>)}
    {themes.map(({ label, reviewers }) => <li key={label}>
      <span>{label}</span><b>{reviewers} {reviewers === 1 ? "reviewer" : "reviewers"}</b>
    </li>)}
  </ul>;
}

function CompareTable({ items, evidence, from, back, trackUsage, showDish, showDiet }: {
  items: Item[]; evidence: Record<string, CompareEvidence>; from: string; back: string;
  trackUsage: boolean; showDish: boolean; showDiet: boolean;
}) {
  const slugs = items.map((item) => item.slug);
  const report = (item: Item) => `/r/${encodeURIComponent(item.slug)}?from=${encodeURIComponent(back)}`;
  return <div className="compare-scroll" role="region" aria-label="Restaurant comparison" tabIndex={0}>
    <table className={`compare-table ${items.length === 3 ? "compare-three" : ""}`}>
      <colgroup><col className="compare-label-col" />{items.map((item) => <col key={item.slug} />)}</colgroup>
      <thead><tr>
        <th scope="col" className="compare-corner"><span className="sr-only">Fact</span></th>
        {items.map((item) => <th key={item.slug} scope="col" className="compare-restaurant">
          <Link className="compare-name" href={report(item)}>{item.name}</Link>
        </th>)}
      </tr></thead>
      <tbody>
        <CompareRow label="Verdict" items={items} className="compare-verdict-row">{(item) => <div className="compare-verdict">
          {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="chip nee-chip">Not enough evidence</span>}
          {item.confidence && <ConfChip level={item.confidence} compact />}
        </div>}</CompareRow>
        <CompareRow label="Why" items={items}>{(item) => <span className="compare-reason">{item.reason ?? "Not enough Reviews yet for a Verdict."}</span>}</CompareRow>
        <CompareRow label="More" items={items} className="compare-action-row">{(item) => <div className="compare-actions">
          <UsageTrackedLink className="book sm compare-book" track={trackUsage} href={item.booking.url} target="_blank" rel="noopener noreferrer">
            {item.booking.label}<ExternalIcon />
          </UsageTrackedLink>
          <Link href={report(item)}>Read the Verdict</Link>
          <CompareRemove slug={item.slug} name={item.name} slugs={slugs} from={from} />
        </div>}</CompareRow>
        <CompareRow label="Format" items={items}>{(item) => item.format || "Not known"}</CompareRow>
        <CompareRow label="Price" items={items}>{(item) => item.priceTier ?? "Not known"}</CompareRow>
        <CompareRow label="Neighbourhood" items={items}>{(item) => item.neighbourhood || "Not known"}</CompareRow>
        {items.some((item) => item.trend) && <CompareRow label="Trend" items={items}>{(item) => item.trend ? <TrendChip trend={item.trend} /> : <span className="muted">Not shown yet</span>}</CompareRow>}
        {showDish && <CompareRow label="Known for" items={items}>{(item) => item.standoutDish ?? <span className="muted">No standout dish yet</span>}</CompareRow>}
        {showDiet && <CompareRow label="Dietary fit" items={items}>{(item) => item.dietaryFits.length
          ? <ul className="compare-diets">{item.dietaryFits.map((diet) => <li key={diet}><DietIcon diet={diet} text={DIET_LABEL[diet]} /></li>)}</ul>
          : <span className="muted">No dietary information yet</span>}</CompareRow>}
        <CompareRow label="Reviewers praise" items={items} className="compare-theme-row">{(item) => <ThemeList themes={(evidence[item.slug] ?? emptyEvidence).strengths} empty="No recurring praise yet" />}</CompareRow>
        <CompareRow label="Reviewers warn" items={items} className="compare-theme-row">{(item) => <ThemeList themes={(evidence[item.slug] ?? emptyEvidence).warnings} redFlags={(evidence[item.slug] ?? emptyEvidence).redFlags} empty="No recurring criticism" />}</CompareRow>
      </tbody>
    </table>
  </div>;
}

export default async function ComparePage({ searchParams = Promise.resolve({}) }: Props) {
  await connection();
  const params = await searchParams;
  const requested = shortlistSlugs(many(params.r));
  const from = safeDirectoryReturn(typeof params.from === "string" ? params.from : undefined);
  const [role, result] = await Promise.all([
    pageRole(),
    requested.length
      ? loadDirectory(parseDirectoryQuery(new URLSearchParams({ nee: "1", pageSize: String(SHORTLIST_LIMIT) })), requested)
      : Promise.resolve(null),
  ]);
  // Keep the order the diner chose: a comparison never ranks the Restaurants for them.
  const items = requested.flatMap((slug) => result?.items.find((item) => item.slug === slug) ?? []);
  const slugs = items.map((item) => item.slug);
  const missing = requested.length - items.length;
  const back = slugs.length ? comparisonHref(slugs, from) : from;
  const showDish = items.some((item) => item.standoutDish);
  const showDiet = items.some((item) => item.dietaryFits.length > 0);
  const mixedFormats = new Set(items.map((item) => item.format.trim().toLocaleLowerCase())).size > 1;
  const evidence = items.length >= 2 ? await loadCompareEvidence(slugs) : {};

  return <div className="compare-page">
    <Link className="btn btn-secondary report-back" href={from}>Back to results</Link>
    <header className="compare-head">
      <h1>Compare</h1>
      <p className="muted">Your shortlist, lined up to help you choose where to eat.</p>
    </header>
    {missing > 0 && <p className="notice" role="status">{missing === 1 ? "One Restaurant" : `${missing} Restaurants`} on this list could not be found.</p>}
    {items.length >= 2
      ? <>
        {mixedFormats && <p className="compare-format-note"><strong>Different Formats.</strong> Each Verdict is judged against Restaurants of its own kind, so the Tiers do not compare directly.</p>}
        {items.length === 3 && <p className="compare-swipe-hint small">On a phone, swipe the comparison sideways to see the third Restaurant.</p>}
        <CompareTable items={items} evidence={evidence} from={from} back={back} trackUsage={role === "invitee"} showDish={showDish} showDiet={showDiet} />
        {(!showDish || !showDiet) && <p className="compare-note small muted">
          {!showDish && "No standout dish in the Reviews yet for any of these. "}
          {!showDiet && "No dietary information in the Reviews yet for any of these."}
        </p>}
      </>
      : <div className="dir-empty">
        <p><strong>{items.length === 1 ? "A comparison needs two Restaurants." : "Nothing to compare yet."}</strong></p>
        <p className="small muted">Choose “Shortlist” on two or three Restaurants in the results, then come back here.</p>
        <div className="state-actions"><Link className="btn" href={from}>Back to results</Link></div>
      </div>}
  </div>;
}
