import type { SourceHistory } from "@/verdict/rollup";

type Props = { history: SourceHistory[]; names: Record<string, string> };

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
                {quarters.map((q, i) => i % Math.max(1, Math.ceil(quarters.length / 12)) === 0 || i === quarters.length - 1
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
