import { Fragment } from "react";
import Link from "next/link";
import { TIER_LABEL } from "@/domain/aspects";
import { ConfChip, DietIcon, TierBadge, TrendChip } from "@/web/atoms";
import { ExternalIcon } from "@/web/icons";
import type { DirectoryItem, DirectoryQuery, DirectoryResponse } from "@/lib/api-contract";
import { directoryHref } from "@/lib/directory-url";
import { TierLegend } from "@/web/tier-legend";
import { UsageTrackedLink, UsageTrackedNavLink } from "@/web/usage-tracking";
import DirectoryControls from "./directory-controls";

// Sorted by Tier, the ementa reads in courses: a heading where the Tier changes, like a menu's section titles.
const courseOf = (item?: DirectoryItem) => (item ? item.tier ?? "nee" : null);

function Course({ item }: { item: DirectoryItem }) {
  return <li className="ementa-course" role="presentation" aria-hidden="true">
    <span>{item.tier ? TIER_LABEL[item.tier] : "Not enough evidence"}</span>
  </li>;
}

function Row({ item, trackUsage }: { item: DirectoryItem; trackUsage: boolean }) {
  // A Restaurant is one line of the ementa: name, a dotted leader, then its Verdict. Format, Price and Area sit under the name as one quiet line.
  const meta = [item.format, item.priceTier, item.neighbourhood].filter(Boolean).join(" · ");
  return <li className="dir-row" data-tier={item.tier ?? "nee"}>
    <div className="line-top">
      <h3 className="line-name"><Link href={`/r/${encodeURIComponent(item.slug)}`}>{item.name}</Link></h3>
      <i className="leader" aria-hidden="true" />
      {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="chip nee-chip">Not enough evidence</span>}
    </div>
    {item.reason && <p className="line-reason">{item.reason}{item.standoutDish && <span className="line-dish"> · Known for {item.standoutDish}</span>}</p>}
    {meta && <p className="line-meta">{meta}</p>}
    <div className="line-foot">
      {item.confidence && <ConfChip level={item.confidence} />}
      <TrendChip trend={item.trend} />
      {item.dietaryFits.length > 0 && <span className="dir-diet">{item.dietaryFits.map((diet) => <DietIcon key={diet} diet={diet} iconOnly />)}</span>}
      <UsageTrackedLink className="book sm" track={trackUsage} href={item.booking.url} target="_blank" rel="noopener noreferrer">{item.booking.label}<ExternalIcon /></UsageTrackedLink>
    </div>
  </li>;
}

export default function Directory({ query, result, trackUsage = false }: { query: DirectoryQuery; result: DirectoryResponse; trackUsage?: boolean }) {
  const filtered = !!query.q || query.tier.length > 0 || query.family.length > 0 || query.price.length > 0 || query.area.length > 0 || query.diet.length > 0;
  const view = (page: number) => directoryHref({ ...query, page });
  return <section className="directory" aria-labelledby="directory-title">
    <div className="dir-head">
      <h2 id="directory-title">All Restaurants</h2>
      <p className="small muted" role="status">
        {result.total} {result.total === 1 ? "Restaurant" : "Restaurants"}
        {!query.nee && result.hiddenNotEnoughEvidence > 0 && ` · ${result.hiddenNotEnoughEvidence} with Not enough evidence hidden`}
      </p>
    </div>
    <div className="dir-layout">
      <DirectoryControls query={query} neighbourhoods={result.neighbourhoods} trackUsage={trackUsage} />
      <div className="dir-main">
        <TierLegend />
        {result.items.length === 0
          ? <div className="dir-empty">
            <p><strong>No Restaurants match.</strong></p>
            {(filtered || query.nee) && <p className="small muted">Try fewer filters.</p>}
            {(filtered || query.nee) && <UsageTrackedNavLink className="btn" href="/" track={trackUsage} eventType="filter">Clear filters</UsageTrackedNavLink>}
          </div>
          : <ol className="ementa" aria-label="Restaurants">
            {result.items.map((item, index) => <Fragment key={item.slug}>
              {query.sort === "tier" && courseOf(item) !== courseOf(result.items[index - 1]) && <Course item={item} />}
              <Row item={item} trackUsage={trackUsage} />
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
