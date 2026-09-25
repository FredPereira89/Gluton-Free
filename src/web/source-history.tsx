import type { Blocks } from "@/verdict/blocks";
import { quarterOf, type SourceHistory } from "@/verdict/rollup";

type Props = { history: SourceHistory[]; names: Record<string, string> };

type CompositeProps = { series: Blocks["rollup"]["series"]; changePointAt: string | null | undefined };

const round = (x: number) => Math.round(x);

/** Every nth index (plus the last), so long series don't crowd the x-axis with labels. */
function tickIndices(length: number): (i: number) => boolean {
  const every = Math.max(1, Math.ceil(length / 12));
  return (i) => i % every === 0 || i === length - 1;
}

export function CompositeHistoryChart({ series, changePointAt }: CompositeProps) {
  const points = series.filter((q) => q.compositePercentile != null);
  if (!points.length) return null;
  const width = Math.max(600, series.length * 30);
  const left = 46;
  const right = width - 14;
  const step = series.length > 1 ? (right - left) / (series.length - 1) : 0;
  const x = (i: number) => left + i * step;
  const y = (pct: number) => 20 + (100 - pct) * 0.82;
  const changePointQuarter = changePointAt ? quarterOf(new Date(changePointAt)) : null;
  const changePointIndex = changePointQuarter ? series.findIndex((q) => q.quarter === changePointQuarter) : -1;
  return (
    <div className="composite-history">
      <h2>Composite percentile over time</h2>
      <p className="small muted">Composite percentile per quarter inside the Review window, ranked against today&rsquo;s Peers. A hollow marker means fewer than 8 text Reviews that quarter.</p>
      <div className="history-scroll">
        <svg viewBox={`0 0 ${width} 110`} width={width} height="110" role="img" aria-label="Composite percentile by quarter">
          {[0, 50, 100].map((pct) => (
            <g key={pct}>
              <line x1={left} x2={right} y1={y(pct)} y2={y(pct)} className="chart-grid" />
              <text x="22" y={y(pct) + 4} className="chart-tick">{pct}</text>
            </g>
          ))}
          {changePointIndex >= 0 && (
            <g>
              <line x1={x(changePointIndex)} x2={x(changePointIndex)} y1="20" y2="102" className="chart-changepoint" />
              <text x={x(changePointIndex)} y="14" textAnchor="middle" className="chart-tick">Change point</text>
            </g>
          )}
          {series.slice(1).map((q, i) => {
            const previous = series[i]!;
            return previous.compositePercentile != null && q.compositePercentile != null
              ? <line key={q.quarter} x1={x(i)} y1={y(previous.compositePercentile)} x2={x(i + 1)} y2={y(q.compositePercentile)} className="chart-composite" />
              : null;
          })}
          {series.map((q, i) => q.compositePercentile == null ? null : (
            <circle
              key={q.quarter}
              data-quarter={q.quarter}
              cx={x(i)}
              cy={y(q.compositePercentile)}
              r="4"
              className={q.enoughReviews ? "chart-composite-dot" : "chart-composite-dot-hollow"}
            >
              <title>{`${q.quarter}: P${round(q.compositePercentile)} vs today's Peers${q.enoughReviews ? "" : " · few Reviews"}`}</title>
            </circle>
          ))}
          {series.map((q, i) => tickIndices(series.length)(i)
            ? <text key={q.quarter} x={x(i)} y="109" textAnchor="middle" className="chart-tick">{q.quarter}</text> : null)}
        </svg>
      </div>
    </div>
  );
}

export function SourceHistoryChart({ history, names }: Props) {
  if (!history.length) return null;
  return (
    <div className="source-history">
      <h2>Stars and Review volume over time</h2>
      <p className="small muted">Full Review history by Source. Stars appear only in quarters with at least 5 ratings; gaps mean too few ratings. Bars count all Reviews.</p>
      {history.map(({ source, quarters }) => {
        const name = names[source] ?? source;
        const width = Math.max(600, quarters.length * 30);
        const left = 46;
        const right = width - 14;
        const step = quarters.length > 1 ? (right - left) / (quarters.length - 1) : 0;
        const x = (i: number) => left + i * step;
        const starY = (stars: number) => 116 - (stars - 1) * 24;
        const maxVolume = Math.max(1, ...quarters.map((q) => q.volume));
        const volumeHeight = (volume: number) => 82 * volume / maxVolume;
        return (
          <div className="history-source" key={source}>
            <h3>{name}</h3>
            <div className="history-scroll">
              <svg viewBox={`0 0 ${width} 246`} width={width} height="246" role="img" aria-label={`${name} quarterly stars and Review volume`}>
                <text x="2" y="18" className="chart-label">Stars</text>
                {[1, 3, 5].map((rating) => <g key={rating}>
                  <line x1={left} x2={right} y1={starY(rating)} y2={starY(rating)} className="chart-grid" />
                  <text x="22" y={starY(rating) + 4} className="chart-tick">{rating}</text>
                </g>)}
                {quarters.slice(1).map((q, i) => {
                  const previous = quarters[i]!;
                  return previous.stars !== null && q.stars !== null
                    ? <line key={q.quarter} x1={x(i)} y1={starY(previous.stars)} x2={x(i + 1)} y2={starY(q.stars)} className="chart-stars" />
                    : null;
                })}
                {quarters.map((q, i) => q.stars === null ? null :
                  <circle key={q.quarter} data-quarter={q.quarter} cx={x(i)} cy={starY(q.stars)} r="4" className="chart-star-dot">
                    <title>{`${q.quarter}: ${q.stars.toFixed(2)} stars from ${q.ratings} ratings`}</title>
                  </circle>)}
                <text x="2" y="151" className="chart-label">Reviews</text>
                <line x1={left} x2={right} y1="232" y2="232" className="chart-grid" />
                {quarters.map((q, i) => <rect key={q.quarter} x={x(i) - 8} y={232 - volumeHeight(q.volume)} width="16" height={volumeHeight(q.volume)} className="chart-volume">
                  <title>{`${q.quarter}: ${q.volume} Reviews`}</title>
                </rect>)}
                {quarters.map((q, i) => tickIndices(quarters.length)(i)
                  ? <text key={q.quarter} x={x(i)} y="245" textAnchor="middle" className="chart-tick">{q.quarter}</text> : null)}
              </svg>
            </div>
            <details className="small">
              <summary>Quarterly data for {name}</summary>
              <div className="tbl-wrap"><table className="src"><thead><tr><th>Quarter</th><th className="num">Stars</th><th className="num">Ratings</th><th className="num">Reviews</th></tr></thead>
                <tbody>{quarters.map((q) => <tr key={q.quarter}><td>{q.quarter}</td><td className="num">{q.stars?.toFixed(2) ?? "—"}</td><td className="num">{q.ratings}</td><td className="num">{q.volume}</td></tr>)}</tbody>
              </table></div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
