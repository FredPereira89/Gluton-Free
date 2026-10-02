// Compare: the diner's shortlist (two or three Restaurants) side by side on the facts that differ.
// The slugs come from the URL; every Verdict is loaded fresh, never read back from the browser.
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
import { loadDirectory } from "@/web/data";
import { ExternalIcon } from "@/web/icons";
import { CompareRemove } from "@/web/shortlist";
import { UsageTrackedLink } from "@/web/usage-tracking";

export const metadata: Metadata = { title: "Compare · Gluton-Free", robots: { index: false, follow: false } };

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="compare-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

function CompareCard({ item, slugs, from, trackUsage, back, showDish, showDiet }: { item: DirectoryItem; slugs: string[]; from: string; trackUsage: boolean; back: string; showDish: boolean; showDiet: boolean }) {
  const report = `/r/${encodeURIComponent(item.slug)}?from=${encodeURIComponent(back)}`;
  return <li className="compare-card" data-tier={item.tier ?? "nee"}>
    <h2 className="compare-name"><Link href={report}>{item.name}</Link></h2>
    <div className="compare-verdict">
      {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="chip nee-chip">Not enough evidence</span>}
      {item.confidence && <ConfChip level={item.confidence} />}
      <TrendChip trend={item.trend} />
    </div>
    {item.reason
      ? <p className="compare-reason">{item.reason}</p>
      : <p className="compare-reason muted">There are not enough Reviews yet to give this Restaurant a Verdict.</p>}
    <dl className="compare-facts">
      <Fact label="Kind of place">{item.format || "Not known"}</Fact>
      <Fact label="Price">{item.priceTier ?? "Not known"}</Fact>
      <Fact label="Neighbourhood">{item.neighbourhood || "Not known"}</Fact>
      {showDish && <Fact label="Known for">{item.standoutDish ?? <span className="muted">No standout dish in the Reviews yet</span>}</Fact>}
      {showDiet && <Fact label="Dietary fit">
        {item.dietaryFits.length
          ? <ul className="compare-diets">{item.dietaryFits.map((diet) => <li key={diet}><DietIcon diet={diet} text={DIET_LABEL[diet]} /></li>)}</ul>
          : <span className="muted">No dietary information in the Reviews yet</span>}
      </Fact>}
    </dl>
    <div className="compare-actions">
      <Link className="btn" href={report}>Read the Verdict</Link>
      <UsageTrackedLink className="book sm" track={trackUsage} href={item.booking.url} target="_blank" rel="noopener noreferrer">{item.booking.label}<ExternalIcon /></UsageTrackedLink>
      <CompareRemove slug={item.slug} name={item.name} slugs={slugs} from={from} />
    </div>
  </li>;
}

export default async function ComparePage({ searchParams = Promise.resolve({}) }: Props) {
  await connection();
  const params = await searchParams;
  const requested = shortlistSlugs(many(params.r));
  const from = safeDirectoryReturn(typeof params.from === "string" ? params.from : undefined);
  const role = await pageRole();
  const result = requested.length
    ? await loadDirectory(parseDirectoryQuery(new URLSearchParams({ nee: "1", pageSize: String(SHORTLIST_LIMIT) })), requested)
    : null;
  // Keep the order the diner chose: a comparison never ranks the Restaurants for them.
  const items = requested.flatMap((slug) => result?.items.find((item) => item.slug === slug) ?? []);
  const slugs = items.map((item) => item.slug);
  const missing = requested.length - items.length;
  const back = slugs.length ? comparisonHref(slugs, from) : from;
  // A row that is empty for every Restaurant says one thing once, not the same thing per card.
  const showDish = items.some((item) => item.standoutDish);
  const showDiet = items.some((item) => item.dietaryFits.length > 0);

  return <div className="compare-page">
    <Link className="btn btn-secondary report-back" href={from}>Back to results</Link>
    <header className="compare-head">
      <h1>Compare</h1>
      <p className="muted">Your shortlist, side by side. Each Verdict is judged against Restaurants of its own kind.</p>
    </header>
    {missing > 0 && <p className="notice" role="status">{missing === 1 ? "One Restaurant" : `${missing} Restaurants`} on this list could not be found.</p>}
    {items.length >= 2
      ? <>
        <ol className="compare-grid" aria-label="Shortlisted Restaurants">
          {items.map((item) => <CompareCard key={item.slug} item={item} slugs={slugs} from={from} back={back} trackUsage={role === "invitee"} showDish={showDish} showDiet={showDiet} />)}
        </ol>
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
