// A simplified standing-over-time chart for "How we judged this": where the restaurant sat among
// its peers each quarter, in words. No percentile numbers; the quarter's tooltip says it in plain terms.
import type { Blocks } from "@/verdict/blocks";
import { standingPhrase } from "@/verdict/plain-report";
import { quarterOf } from "@/verdict/rollup";

type Props = { series: Blocks["rollup"]["series"]; changePointAt: string | null | undefined };

/** Every nth index (plus the last), so long series don't crowd the x-axis with labels. */
function tickIndices(length: number): (i: number) => boolean {
  const every = Math.max(1, Math.ceil(length / 12));
  return (i) => i % every === 0 || i === length - 1;
}

export function StandingHistoryChart({ series, changePointAt }: Props) {
  if (!series.some((q) => q.compositePercentile != null)) return null;
  const width = Math.max(600, series.length * 30);
  const left = 56;
  const right = width - 14;
  const step = series.length > 1 ? (right - left) / (series.length - 1) : 0;
  const x = (i: number) => left + i * step;
  const y = (pct: number) => 20 + (100 - pct) * 0.82;
  const changePointQuarter = changePointAt ? quarterOf(new Date(changePointAt)) : null;
  const changePointIndex = changePointQuarter ? series.findIndex((q) => q.quarter === changePointQuarter) : -1;
  return (
    <div className="composite-history">
      <h3>How its standing has moved</h3>
      <p className="small muted">Each quarter&rsquo;s reviews, compared with today&rsquo;s other restaurants of its kind. A hollow dot means few written reviews that quarter.</p>
      <div className="history-scroll">
        <svg viewBox={`0 0 ${width} 110`} width={width} height="110" role="img" aria-label="Standing among similar restaurants, by quarter">
          {[["Higher", 100], ["Middle", 50], ["Lower", 0]].map(([word, pct]) => (
            <g key={word}>
              <line x1={left} x2={right} y1={y(pct as number)} y2={y(pct as number)} className="chart-grid" />
              <text x="2" y={y(pct as number) + 4} className="chart-tick">{word}</text>
            </g>
          ))}
          {changePointIndex >= 0 && (
            <g>
              <line x1={x(changePointIndex)} x2={x(changePointIndex)} y1="20" y2="102" className="chart-changepoint" />
              <text x={x(changePointIndex)} y="14" textAnchor="middle" className="chart-tick">Change</text>
            </g>
          )}
          {series.slice(1).map((q, i) => {
            const previous = series[i]!;
            return previous.compositePercentile != null && q.compositePercentile != null
              ? <line key={q.quarter} x1={x(i)} y1={y(previous.compositePercentile)} x2={x(i + 1)} y2={y(q.compositePercentile)} className="chart-composite" />
              : null;
          })}
          {series.map((q, i) => q.compositePercentile == null ? null : (
            <circle key={q.quarter} data-quarter={q.quarter} cx={x(i)} cy={y(q.compositePercentile)} r="4"
              className={q.enoughReviews ? "chart-composite-dot" : "chart-composite-dot-hollow"}>
              <title>{`${q.quarter}: ${standingPhrase(q.compositePercentile)} similar restaurants${q.enoughReviews ? "" : " · few reviews"}`}</title>
            </circle>
          ))}
          {series.map((q, i) => tickIndices(series.length)(i)
            ? <text key={q.quarter} x={x(i)} y="109" textAnchor="middle" className="chart-tick">{q.quarter}</text> : null)}
        </svg>
      </div>
    </div>
  );
}
