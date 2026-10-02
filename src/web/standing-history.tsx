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
  const width = showAll ? Math.max(600, visible.length * 52) : 360;
  const height = 156;
  const left = 84;
  const right = width - 30;
  const step = visible.length > 1 ? (right - left) / (visible.length - 1) : 0;
  const x = (index: number) => visible.length > 1 ? left + index * step : (left + right) / 2;
  const y = (percentile: number) => 44 + (100 - percentile) * 0.68;
  const changePointQuarter = changePointAt ? quarterOf(new Date(changePointAt)) : null;
  const changePointIndex = changePointQuarter ? visible.findIndex((quarter) => quarter.quarter === changePointQuarter) : -1;
  const every = Math.max(1, Math.ceil(visible.length / 8));
  // Three cut-paper strips stand for Higher, Middle and Lower: the word is on the strip, so colour is never the only cue.
  const bands = [
    { word: "Higher", cls: "hi", top: 27 },
    { word: "Middle", cls: "mid", top: 62 },
    { word: "Lower", cls: "lo", top: 97 },
  ] as const;

  return (
    <div className="composite-history">
      <h3>How its standing has moved</h3>
      <p className="small muted">Each quarter&apos;s reviews, compared with today&apos;s other Restaurants of its kind. A hollow dot means few written reviews that quarter.</p>
      <button className="btn btn-secondary history-toggle" type="button" aria-expanded={showAll} aria-controls={chartId}
        onClick={() => setShowAll((value) => !value)}>
        {showAll ? "Show latest eight quarters" : "Show full history"}
      </button>
      <div id={chartId} className={"history-scroll" + (showAll ? "" : " fit")} tabIndex={0} role="region" aria-label={showAll ? "Full standing history, scrolls sideways" : "Latest eight quarters of standing"}>
        <svg viewBox={"0 0 " + width + " " + height} width={showAll ? width : undefined} height={showAll ? height : undefined} role="img"
          aria-label={showAll ? "Full history of standing among similar Restaurants, by quarter" : "Latest eight quarters of standing among similar Restaurants"}>
          {bands.map((band) => (
            <g key={band.word}>
              <rect x="0" y={band.top} width={width} height="32" rx="16" className={"chart-band chart-band-" + band.cls} />
              <text x="16" y={band.top + 21} className="chart-label">{band.word}</text>
            </g>
          ))}
          {changePointIndex >= 0 && (
            <g>
              <line x1={x(changePointIndex)} x2={x(changePointIndex)} y1="26" y2="132" className="chart-changepoint" />
              <rect x={x(changePointIndex) - 30} y="2" width="60" height="20" rx="10" className="chart-change-pill" />
              <text x={x(changePointIndex)} y="16" textAnchor="middle" className="chart-change-text">Change</text>
            </g>
          )}
          {visible.slice(1).map((quarter, index) => {
            const previous = visible[index]!;
            return previous.compositePercentile != null && quarter.compositePercentile != null
              ? <line key={quarter.quarter} x1={x(index)} y1={y(previous.compositePercentile)} x2={x(index + 1)} y2={y(quarter.compositePercentile)} className="chart-composite" />
              : null;
          })}
          {visible.map((quarter, index) => quarter.compositePercentile == null ? null : (
            <circle key={quarter.quarter} cx={x(index)} cy={y(quarter.compositePercentile)} r={index === visible.length - 1 ? 9 : 7}
              className={quarter.enoughReviews ? "chart-composite-dot" : "chart-composite-dot-hollow"}>
              <title>{quarter.quarter + ": " + standingPhrase(quarter.compositePercentile) + " among similar Restaurants" + (quarter.enoughReviews ? "" : " · few reviews")}</title>
            </circle>
          ))}
          {visible.map((quarter, index) => index % every === 0 || index === visible.length - 1
            ? <text key={quarter.quarter} x={x(index)} y="151" textAnchor="middle" className="chart-tick">{quarter.quarter}</text>
            : null)}
        </svg>
      </div>
      {visible.filter((quarter) => quarter.compositePercentile != null).length < 2 && <p className="small muted">Only one quarter of reviews so far, so there is no movement to show yet.</p>}
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
