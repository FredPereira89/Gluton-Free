import { TIERS, TIER_LABEL, TIER_MEANING } from "@/domain/aspects";

/** The Tier legend (issue #119): each Tier's plain meaning, highest first. Collapsed so it stays out of the way. */
export function TierLegend() {
  return <details className="tier-legend">
    <summary>What do the Tiers mean?</summary>
    <dl>
      {[...TIERS].reverse().map((tier) => <div key={tier}>
        <dt>{TIER_LABEL[tier]}</dt>
        <dd>{TIER_MEANING[tier]}</dd>
      </div>)}
    </dl>
  </details>;
}
