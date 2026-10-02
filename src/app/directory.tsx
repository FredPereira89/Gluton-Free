import Link from "next/link";
import { ConfChip, DietIcon, TierBadge, TrendChip } from "@/web/atoms";
import { ExternalIcon } from "@/web/icons";
import type { DirectoryItem, DirectoryQuery, DirectoryResponse } from "@/lib/api-contract";
import { directoryHref } from "@/lib/directory-url";
import { TierLegend } from "@/web/tier-legend";
import { UsageTrackedLink, UsageTrackedNavLink } from "@/web/usage-tracking";
import DirectoryControls from "./directory-controls";

function Row({ item, trackUsage }: { item: DirectoryItem; trackUsage: boolean }) {
  // Format, Price and Area sit under the name as one quiet line, so the table keeps six columns.
  const meta = [item.format, item.priceTier, item.neighbourhood].filter(Boolean).join(" · ");
  return <tr className="dir-row">
    <th scope="row" className="dir-name">
      <Link href={`/r/${encodeURIComponent(item.slug)}`}>{item.name}</Link>
      {meta && <span className="dir-meta">{meta}</span>}
    </th>
    <td data-label="Tier">
      {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="chip nee-chip">Not enough evidence</span>}
    </td>
    <td data-label="Confidence">{item.confidence ? <ConfChip level={item.confidence} compact /> : <span className="muted">–</span>}</td>
    <td data-label="Trend">{item.trend ? <TrendChip trend={item.trend} /> : <span className="muted">–</span>}</td>
    <td data-label="Dietary fit">{item.dietaryFits.length > 0
      ? <span className="dir-diet">{item.dietaryFits.map((diet) => <DietIcon key={diet} diet={diet} iconOnly />)}</span>
      : <span className="muted">–</span>}</td>
    <td className="dir-book">
      <UsageTrackedLink className="book sm" track={trackUsage} href={item.booking.url} target="_blank" rel="noopener noreferrer">{item.booking.label}<ExternalIcon /></UsageTrackedLink>
    </td>
  </tr>;
}

export default function Directory({ query, result, trackUsage = false }: { query: DirectoryQuery; result: DirectoryResponse; trackUsage?: boolean }) {
  const filtered = !!query.q || query.tier.length > 0 || query.family.length > 0 || query.price.length > 0 || query.area.length > 0 || query.diet.length > 0;
  const view = (page: number) => directoryHref({ ...query, page });
  return <section className="directory" aria-labelledby="directory-title">
    <h2 id="directory-title">All Restaurants</h2>
    <DirectoryControls query={query} neighbourhoods={result.neighbourhoods} trackUsage={trackUsage} />
    <TierLegend />
    <p className="small muted" role="status">
      {result.total} {result.total === 1 ? "Restaurant" : "Restaurants"}
      {!query.nee && result.hiddenNotEnoughEvidence > 0 && ` · ${result.hiddenNotEnoughEvidence} with Not enough evidence hidden`}
    </p>
    {result.items.length === 0
      ? <div className="dir-empty">
        <p><strong>No Restaurants match.</strong></p>
        {(filtered || query.nee) && <p className="small muted">Try fewer filters.</p>}
        {(filtered || query.nee) && <UsageTrackedNavLink className="btn" href="/" track={trackUsage} eventType="filter">Clear filters</UsageTrackedNavLink>}
      </div>
      : <div className="dir-scroll" tabIndex={0} role="region" aria-label="Restaurants"><table className="dir-table">
        <thead><tr><th scope="col">Restaurant</th><th scope="col">Tier</th><th scope="col">Confidence</th><th scope="col">Trend</th><th scope="col">Dietary fit</th><th scope="col">Book</th></tr></thead>
        <tbody>{result.items.map((item) => <Row key={item.slug} item={item} trackUsage={trackUsage} />)}</tbody>
      </table></div>}
    {result.totalPages > 1 && <nav className="dir-pages" aria-label="Pages">
      {result.page > 1 ? <Link className="btn btn-secondary" rel="prev" href={view(result.page - 1)}>Previous</Link> : <span />}
      <span className="small muted">Page {result.page} of {result.totalPages}</span>
      {result.page < result.totalPages ? <Link className="btn btn-secondary" rel="next" href={view(result.page + 1)}>Next</Link> : <span />}
    </nav>}
  </section>;
}
