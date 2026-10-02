import { Fragment } from "react";
import Link from "next/link";
import { TIER_LABEL } from "@/domain/aspects";
import { ConfChip, DietIcon, TierBadge } from "@/web/atoms";
import { ShortlistButton } from "@/web/shortlist";
import { ExternalIcon } from "@/web/icons";
import type { DirectoryItem, DirectoryQuery, DirectoryResponse } from "@/lib/api-contract";
import { directoryHref } from "@/lib/directory-url";
import { TierLegend } from "@/web/tier-legend";
import { UsageTrackedLink, UsageTrackedNavLink } from "@/web/usage-tracking";
import { DirectoryReturnLink } from "@/web/directory-return-link";
import { DIETS, DIET_LABEL } from "@/domain/dish-dietary";
import { FORMAT_FAMILIES } from "@/domain/format-labels";
import DirectoryControls from "./directory-controls";

// Sorted by Tier, the ementa reads in courses: a heading where the Tier changes, like a menu's section titles.
const courseOf = (item?: DirectoryItem) => (item ? item.tier ?? "nee" : null);

function Course({ item }: { item: DirectoryItem }) {
  return <li className="ementa-course" role="presentation" aria-hidden="true">
    <span>{item.tier ? TIER_LABEL[item.tier] : "Not enough evidence"}</span>
  </li>;
}

function Row({ item, trackUsage, returnTo }: { item: DirectoryItem; trackUsage: boolean; returnTo: string }) {
  // A Restaurant is one line of the ementa: name, a dotted leader, then its Verdict. Format, Price and Area sit under the name as one quiet line.
  const meta = [item.format, item.priceTier, item.neighbourhood].filter(Boolean).join(" · ");
  return <li className="dir-row" data-tier={item.tier ?? "nee"}>
    <div className="line-top">
      <h3 className="line-name"><DirectoryReturnLink href={`/r/${encodeURIComponent(item.slug)}?from=${encodeURIComponent(returnTo)}`} returnTo={returnTo}>{item.name}</DirectoryReturnLink></h3>
      <i className="leader" aria-hidden="true" />
      {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="chip nee-chip">Not enough evidence</span>}
    </div>
    {item.reason && <p className="line-reason">{item.reason}{item.standoutDish && <span className="line-dish"> · Known for {item.standoutDish}</span>}</p>}
    {meta && <p className="line-meta">{meta}</p>}
    <div className="line-foot">
      {item.confidence && <ConfChip level={item.confidence} />}
      {item.dietaryFits.length > 0 && <span className="dir-diet">{item.dietaryFits.map((diet) => <DietIcon key={diet} diet={diet} iconOnly />)}</span>}
      <span className="line-actions">
        <ShortlistButton slug={item.slug} name={item.name} />
        <UsageTrackedLink className="book sm" track={trackUsage} href={item.booking.url} target="_blank" rel="noopener noreferrer">{item.booking.label}<ExternalIcon /></UsageTrackedLink>
      </span>
    </div>
  </li>;
}

export default function Directory({ query, result, trackUsage = false }: { query: DirectoryQuery; result: DirectoryResponse; trackUsage?: boolean }) {
  const returnTo = directoryHref(query);
  const filterGroups: { label: string; href: string }[] = [];
  const withFilters = (patch: Partial<DirectoryQuery>) => directoryHref({ ...query, ...patch }, { resetPage: true });
  const goodOrBetter = ["good", "must_go", "life_changing"] as const;
  if (query.q) filterGroups.push({ label: `Search: ${query.q}`, href: withFilters({ q: "" }) });
  if (query.tier.length === goodOrBetter.length && goodOrBetter.every((tier) => query.tier.includes(tier))) {
    filterGroups.push({ label: "Tier: Good or better", href: withFilters({ tier: [] }) });
  } else for (const tier of query.tier) filterGroups.push({ label: `Tier: ${TIER_LABEL[tier]}`, href: withFilters({ tier: query.tier.filter((value) => value !== tier) }) });
  for (const family of query.family) filterGroups.push({ label: `Format: ${FORMAT_FAMILIES.find((item) => item.code === family)?.label ?? family}`, href: withFilters({ family: query.family.filter((value) => value !== family) }) });
  for (const price of query.price) filterGroups.push({ label: `Price: ${price}`, href: withFilters({ price: query.price.filter((value) => value !== price) }) });
  for (const area of query.area) filterGroups.push({ label: `Neighbourhood: ${area}`, href: withFilters({ area: query.area.filter((value) => value !== area) }) });
  for (const diet of query.diet) filterGroups.push({ label: `Dietary fit: ${DIET_LABEL[diet as (typeof DIETS)[number]]}`, href: withFilters({ diet: query.diet.filter((value) => value !== diet) }) });
  if (query.nee) filterGroups.push({ label: "Not enough evidence", href: withFilters({ nee: false }) });
  const hasFilters = query.tier.length > 0 || query.family.length > 0 || query.price.length > 0 || query.area.length > 0 || query.diet.length > 0 || query.nee;
  const view = (page: number) => directoryHref({ ...query, page });
  return <section className="directory" aria-labelledby="directory-title">
    <div className="dir-head">
      <h2 id="directory-title">All Restaurants</h2>
      <p className="small muted" role="status">
        {result.total} {result.total === 1 ? "Restaurant" : "Restaurants"}
        {!query.nee && result.hiddenNotEnoughEvidence > 0 && <> · <Link href={directoryHref({ ...query, nee: true }, { resetPage: true })}>Show {result.hiddenNotEnoughEvidence} with Not enough evidence</Link></>}
      </p>
    </div>
    {filterGroups.length > 0 && <ul className="active-filters" aria-label="Active search and filters">
      {filterGroups.map((filter) => <li key={`${filter.label}:${filter.href}`}><Link href={filter.href} aria-label={`Remove ${filter.label}`}>{filter.label}<span aria-hidden="true"> ×</span></Link></li>)}
    </ul>}
    <div className="dir-layout">
      <DirectoryControls query={query} neighbourhoods={result.neighbourhoods} resultCount={result.total} trackUsage={trackUsage} />
      <div className="dir-main">
        <TierLegend />
        {result.items.length === 0
          ? <div className="dir-empty">
            <p><strong>{query.q ? `No Restaurants match “${query.q}”.` : "No Restaurants match these filters."}</strong></p>
            <p className="small muted">Change your search or remove one or more filters to see more results.</p>
            <div className="state-actions">
              {hasFilters && <UsageTrackedNavLink className="btn btn-secondary" href={withFilters({ tier: [], family: [], price: [], area: [], diet: [], nee: false })} track={trackUsage} eventType="filter">Clear filters</UsageTrackedNavLink>}
              {query.q && <UsageTrackedNavLink className="btn" href={withFilters({ q: "" })} track={trackUsage} eventType="filter">Clear search</UsageTrackedNavLink>}
            </div>
          </div>
          : <ol className="ementa" aria-label="Restaurants">
            {result.items.map((item, index) => <Fragment key={item.slug}>
              {query.sort === "tier" && courseOf(item) !== courseOf(result.items[index - 1]) && <Course item={item} />}
              <Row item={item} trackUsage={trackUsage} returnTo={returnTo} />
            </Fragment>)}
          </ol>}
        {result.totalPages > 1 && <nav className="dir-pages" aria-label="Pages">
          {result.page > 1 ? <Link className="btn btn-secondary" rel="prev" href={view(result.page - 1)}>Previous</Link> : <span />}
          <span className="small muted">Page {result.page} of {result.totalPages}</span>
          {result.page < result.totalPages ? <Link className="btn btn-secondary" rel="next" href={view(result.page + 1)}>Next</Link> : <span />}
        </nav>}
      </div>
    </div>
  </section>;
}
