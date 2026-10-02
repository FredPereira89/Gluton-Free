"use client";

import { useId, useState } from "react";
import type { Blocks } from "@/verdict/blocks";
import { standingPhrase } from "@/verdict/plain-report";

type Props = { series: Blocks["rollup"]["series"]; changePointAt: string | null | undefined };

function quarterOf(date: Date): string {
  return date.getUTCFullYear() + "-Q" + (Math.floor(date.getUTCMonth() / 3) + 1);
}

export function StandingHistoryChart({ series, changePointAt }: Props) {
  const [showAll, setShowAll] = useState(false);
  const chartId = useId();
  if (!series.some((quarter) => quarter.compositePercentile != null)) return null;

  const visible = showAll ? series : series.slice(-8);
  const width = showAll ? Math.max(600, visible.length * 42) : 360;
  const left = 56;
  const right = width - 14;
  const step = visible.length > 1 ? (right - left) / (visible.length - 1) : 0;
  const x = (index: number) => left + index * step;
  const y = (percentile: number) => 20 + (100 - percentile) * 0.82;
  const changePointQuarter = changePointAt ? quarterOf(new Date(changePointAt)) : null;
  const changePointIndex = changePointQuarter ? visible.findIndex((quarter) => quarter.quarter === changePointQuarter) : -1;
  const every = Math.max(1, Math.ceil(visible.length / 8));

  return (
    <div className="composite-history">
      <h3>How its standing has moved</h3>
      <p className="small muted">Each quarter&apos;s reviews, compared with today&apos;s other Restaurants of its kind. A hollow dot means few written reviews that quarter.</p>
      <button className="btn btn-secondary history-toggle" type="button" aria-expanded={showAll} aria-controls={chartId}
        onClick={() => setShowAll((value) => !value)}>
        {showAll ? "Show latest eight quarters" : "Show full history"}
      </button>
      <div id={chartId} className="history-scroll" tabIndex={0} role="region" aria-label={showAll ? "Full standing history, scrolls sideways" : "Latest eight quarters, scrolls sideways"}>
        <svg viewBox={"0 0 " + width + " 110"} width={showAll ? width : 360} height="110" role="img"
          aria-label={showAll ? "Full history of standing among similar Restaurants, by quarter" : "Latest eight quarters of standing among similar Restaurants"}>
          {([["Higher", 100], ["Middle", 50], ["Lower", 0]] as const).map(([word, percentile]) => (
            <g key={word}>
              <line x1={left} x2={right} y1={y(percentile)} y2={y(percentile)} className="chart-grid" />
              <text x="2" y={y(percentile) + 4} className="chart-tick">{word}</text>
            </g>
          ))}
          {changePointIndex >= 0 && (
            <g>
              <line x1={x(changePointIndex)} x2={x(changePointIndex)} y1="20" y2="102" className="chart-changepoint" />
              <text x={x(changePointIndex)} y="14" textAnchor="middle" className="chart-tick">Change</text>
            </g>
          )}
          {visible.slice(1).map((quarter, index) => {
            const previous = visible[index]!;
            return previous.compositePercentile != null && quarter.compositePercentile != null
              ? <line key={quarter.quarter} x1={x(index)} y1={y(previous.compositePercentile)} x2={x(index + 1)} y2={y(quarter.compositePercentile)} className="chart-composite" />
              : null;
          })}
          {visible.map((quarter, index) => quarter.compositePercentile == null ? null : (
            <circle key={quarter.quarter} cx={x(index)} cy={y(quarter.compositePercentile)} r="4"
              className={quarter.enoughReviews ? "chart-composite-dot" : "chart-composite-dot-hollow"}>
              <title>{quarter.quarter + ": " + standingPhrase(quarter.compositePercentile) + " among similar Restaurants" + (quarter.enoughReviews ? "" : " · few reviews")}</title>
            </circle>
          ))}
          {visible.map((quarter, index) => index % every === 0 || index === visible.length - 1
            ? <text key={quarter.quarter} x={x(index)} y="109" textAnchor="middle" className="chart-tick">{quarter.quarter}</text>
            : null)}
        </svg>
      </div>
      <details className="history-values">
        <summary>Quarterly values</summary>
        <ul>{visible.map((quarter) => (
          <li key={quarter.quarter}>
            <strong>{quarter.quarter}</strong>: {quarter.compositePercentile == null
              ? "Not enough evidence to show a standing."
              : standingPhrase(quarter.compositePercentile) + " among similar Restaurants."}
            {" "}{quarter.enoughReviews ? "Enough written reviews." : "Few written reviews."}
            {quarter.quarter === changePointQuarter && " Review period changed."}
          </li>
        ))}</ul>
      </details>
    </div>
  );
}
