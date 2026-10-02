import { DIET_LABEL } from "@/domain/dish-dietary";
import Link from "next/link";
import { TierBadge, TrendChip } from "@/web/atoms";
import type { DirectoryItem, DirectoryQuery, DirectoryResponse } from "@/lib/api-contract";
import { directoryHref } from "@/lib/directory-url";
import { TierLegend } from "@/web/tier-legend";
import { UsageTrackedLink, UsageTrackedNavLink } from "@/web/usage-tracking";
import DirectoryControls from "./directory-controls";

const CONFIDENCE = { low: ["Low", 1], medium: ["Medium", 2], high: ["High", 3] } as const;

function ConfidenceDots({ level }: { level: NonNullable<DirectoryItem["confidence"]> }) {
  const [label, filled] = CONFIDENCE[level];
  return <span className={`chip conf-${label}`} title={`${label} Confidence`}>
    <span className="dots" aria-hidden="true">{[1, 2, 3].map((dot) => <i key={dot} className={dot <= filled ? "on" : ""} />)}</span>
    <span className="sr-only">{label} Confidence</span>
  </span>;
}

function Row({ item, trackUsage }: { item: DirectoryItem; trackUsage: boolean }) {
  return <tr className="dir-row">
    <th scope="row" className="dir-name"><Link href={`/r/${encodeURIComponent(item.slug)}`}>{item.name}</Link></th>
    <td data-label="Tier">
      {item.tier ? <TierBadge tier={item.tier} dashed={item.provisional} /> : <span className="chip nee">Not enough evidence</span>}
    </td>
    <td data-label="Confidence">{item.confidence ? <ConfidenceDots level={item.confidence} /> : <span className="muted">–</span>}</td>
    <td data-label="Trend">{item.trend ? <TrendChip trend={item.trend} /> : <span className="muted">–</span>}</td>
    <td data-label="Format">{item.format || <span className="muted">–</span>}</td>
    <td data-label="Dietary fit">{item.dietaryFits.map((diet) => <span key={diet} className="chip" title={DIET_LABEL[diet]}><span aria-hidden="true">{diet === "gluten_free" ? "GF" : diet === "vegan" ? "\u{1F331}" : "\u{1F96C}"}</span><span className="sr-only">{DIET_LABEL[diet]}</span></span>)}</td>
    <td data-label="Price">{item.priceTier ?? <span className="muted">–</span>}</td>
    <td data-label="Area">{item.neighbourhood}</td>
    <td className="dir-book">
      <UsageTrackedLink track={trackUsage} href={item.booking.url} target="_blank" rel="noopener noreferrer">{item.booking.label}</UsageTrackedLink>
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
        {(filtered || query.nee) && <UsageTrackedNavLink className="btn" href="/" track={trackUsage} eventType="filter">Clear filters</UsageTrackedNavLink>}
      </div>
      : <div className="dir-scroll"><table className="dir-table">
        <thead><tr><th scope="col">Restaurant</th><th scope="col">Tier</th><th scope="col">Confidence</th><th scope="col">Trend</th><th scope="col">Format</th><th scope="col">Dietary fit</th><th scope="col">Price</th><th scope="col">Area</th><th scope="col">Book</th></tr></thead>
        <tbody>{result.items.map((item) => <Row key={item.slug} item={item} trackUsage={trackUsage} />)}</tbody>
      </table></div>}
    {result.totalPages > 1 && <nav className="dir-pages" aria-label="Pages">
      {result.page > 1 ? <Link className="btn" rel="prev" href={view(result.page - 1)}>← Previous</Link> : <span />}
      <span className="small muted">Page {result.page} of {result.totalPages}</span>
      {result.page < result.totalPages ? <Link className="btn" rel="next" href={view(result.page + 1)}>Next →</Link> : <span />}
    </nav>}
  </section>;
}
