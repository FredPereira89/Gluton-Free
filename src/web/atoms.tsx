// Server-rendered atoms of the Verdict page, after the prototype's helpers.
import { Fragment, type ReactNode } from "react";
import { INPUT_LABEL, TIERS, TIER_LABEL, type Tier } from "@/domain/aspects";
import type { Blocks } from "@/verdict/blocks";

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
    </span>
  );
}

const CONF = { low: ["Low", 1], medium: ["Medium", 2], high: ["High", 3] } as const;

export function ConfChip({ level }: { level: "low" | "medium" | "high" }) {
  const [label, n] = CONF[level];
  return (
    <span className={`chip conf-${label}`}>
      <span className="dots" aria-hidden="true">
        {[1, 2, 3].map((j) => (
          <i key={j} className={j <= n ? "on" : ""} />
        ))}
      </span>
      {label} Confidence
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
