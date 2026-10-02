// Server-rendered atoms of the Verdict page, after the prototype's helpers.
import { Fragment, type ReactNode } from "react";
import { INPUT_LABEL, TIERS, TIER_LABEL, type Tier } from "@/domain/aspects";
import { DIET_LABEL, type Diet } from "@/domain/dish-dietary";
import { Icon } from "./icons";
import type { Blocks } from "@/verdict/blocks";
import type { Trend } from "@/verdict/trend";
import { formatPercentile } from "@/verdict/peer";

const TIER_CLASS: Record<Tier, string> = { avoid: "t-avoid", ok: "t-ok", good: "t-good", must_go: "t-must", life_changing: "t-life" };


export function TierBadge({ tier, size = "", dashed = false }: { tier: Tier; size?: string; dashed?: boolean }) {
  const idx = TIERS.indexOf(tier);
  return (
    <span className={`tier ${TIER_CLASS[tier]} ${size} ${dashed ? "dashed" : ""}`}>
      <span className="pips" aria-hidden="true">
      {TIERS.map((t, j) => (
        <i key={t} className={j <= idx ? "on" : ""} />
      ))}
      </span>
      {TIER_LABEL[tier]}
      {dashed && <span className="sr-only">, provisional</span>}
    </span>
  );
}

const CONF = { low: ["Low", 1], medium: ["Medium", 2], high: ["High", 3] } as const;

const TREND = {
  improving: ["Improving", "M4 16l6-6 4 4 6-7M15 7h5v5"],
  steady: ["Steady", "M4 12h16M15 7l5 5-5 5"],
  slipping: ["Slipping", "M4 8l6 6 4-4 6 7M15 17h5v-5"],
} as const;

/** The Trend chip (issue #113): where the Restaurant's standing among its Peers is heading. Renders nothing without a Trend. */
export function TrendChip({ trend }: { trend: Trend | null | undefined }) {
  if (!trend) return null;
  const [label, path] = TREND[trend];
  return (
    <span className={`chip trend-${trend}`} title="Standing among similar restaurants over the last 12 months">
      <Icon d={path} size={14} /> {label}
    </span>
  );
}

/** Three round dots plus the level. `compact` shortens the visible word on tight rows; the full phrase stays for screen readers. */
export function ConfChip({ level, compact = false }: { level: "low" | "medium" | "high"; compact?: boolean }) {
  const [label, n] = CONF[level];
  return (
    <span className={`chip conf-${label}`} title={compact ? `${label} Confidence` : undefined}>
      <span className="dots" aria-hidden="true">
        {[1, 2, 3].map((j) => (
          <i key={j} className={j <= n ? "on" : ""} />
        ))}
      </span>
      {compact ? <><span aria-hidden="true">{label}</span><span className="sr-only">{label} Confidence</span></> : <>{label} Confidence</>}
    </span>
  );
}

const DIET_ICON: Record<Diet, string> = {
  vegetarian: "M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 15c0-3 2-5 6-5 0 3-2 5-6 5z",
  vegan: "M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l8-8",
  gluten_free: "M12 21V9M12 9c-2-.5-3-2-3-4 2 .5 3 2 3 4zM12 9c2-.5 3-2 3-4-2 .5-3 2-3 4zM12 15c-2-.5-3-2-3-4M12 15c2-.5 3-2 3-4M4 4l16 16",
};

/** A Dietary fit badge: a drawn icon in a round tint. Icon-only (`iconOnly`) hides the name visually on wide screens (still read aloud, and a tooltip) and shows it on phone cards. */
export function DietIcon({ diet, text, iconOnly = false }: { diet: Diet; text?: string; iconOnly?: boolean }) {
  const name = text ?? DIET_LABEL[diet];
  return (
    <span className={`diet diet-${diet}`} title={iconOnly ? name : undefined}>
      <span className="diet-badge"><Icon d={DIET_ICON[diet]} size={16} /></span>
      <span className={iconOnly ? "diet-text" : ""}>{name}</span>
    </span>
  );
}

export const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

type Stat = Blocks["rollup"]["inputs"][number];

export function StripRow({ s, formatName }: { s: Stat; formatName: string }) {
  const x = Math.min(100, Math.max(0, ((s.theta + 2) / 4) * 100));
  const label = INPUT_LABEL[s.input];
  const tip = `${label}: θ ${signed(s.theta)}\nn_eff ${s.nEff.toFixed(0)} · ${s.n} Reviews\n${s.counted ? `weight ${Math.round(s.weight * 100)}%` : "informative only"}\nPeers not gathered: default scale`;
  return (
    <div className={`strip ${s.counted ? "" : "info"} ${s.counted && s.theta < 0 ? "low" : ""}`}>
      <div className="lab">
        {label}
        <small>
          {!s.counted
            ? `not counted at a ${formatName}`
            : s.n === 0
              ? `weight ${Math.round(s.weight * 100)}% · no mentions yet`
              : `weight ${Math.round(s.weight * 100)}% · n_eff ${s.nEff.toFixed(0)}`}
        </small>
      </div>
      <div className="track hit" tabIndex={0} data-tip={tip} aria-label={tip.replace(/\n/g, ", ")}>
        <div className="rail" />
        <div className="med" style={{ left: "50%" }} />
        <div className="dot" style={{ left: `${x}%` }} />
      </div>
      <div className="val">{signed(s.theta)}</div>
    </div>
  );
}

export function StripAxis() {
  const ticks: [string, number][] = [
    ["−2", 0],
    ["0", 50],
    ["+2", 100],
  ];
  return (
    <div className="axis">
      <span />
      <div className="ticks">
        {ticks.map(([t, p]) => (
          <span key={t} style={{ left: `${p}%` }}>
            {t}
          </span>
        ))}
      </div>
      <span />
    </div>
  );
}

export function PeerStripRow({ s, standing, floor, formatName }: { s: Stat; standing: NonNullable<Blocks["rollup"]["standings"]>[number] | undefined; floor?: number; formatName: string }) {
  const label = INPUT_LABEL[s.input];
  const groupName = standing?.level === "format" ? `${formatName}s` : standing?.level === "family"
    ? `${standing.key.replaceAll("_", " ")} Restaurants` : "Lisbon Restaurants";
  const pct = standing ? Math.round(standing.percentile) : null;
  const description = !s.counted ? "not counted" : pct === null ? "Peers still being gathered"
    : `better than ${pct}% of ${groupName}`;
  const floorLabel = floor !== undefined ? `; floor at P${floor}` : "";
  return (
    <div className={`strip ${s.counted ? "" : "info"}`}>
      <div className="lab">{label}<small>{description}</small></div>
      <div className="track" role="img" aria-label={`${label}: ${description}; median at P50${floorLabel}`}>
        <div className="rail" />
        <div className="med" style={{ left: "50%" }} />
        {floor !== undefined && <div className="floor" style={{ left: `${floor}%` }} />}
        {pct !== null && <div className="dot" style={{ left: `${standing!.percentile}%` }} />}
      </div>
      <div className="val">{pct === null ? "—" : formatPercentile(standing!.percentile)}</div>
    </div>
  );
}

export function PeerStripAxis() {
  return <div className="axis"><span /><div className="ticks"><span style={{ left: "0%" }}>P0</span><span style={{ left: "50%" }}>P50</span><span style={{ left: "100%" }}>P100</span></div><span /></div>;
}

/** Renders the explanation, whose only markup is one **bold** Tier name. */
export function Explanation({ text }: { text: string }): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

export const dateLabel = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Lisbon" }) : "—";

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
