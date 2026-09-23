import Link from "next/link";
import { connection } from "next/server";
import type { Tier } from "@/domain/aspects";
import { TierBadge } from "@/web/atoms";
import { listRestaurants } from "@/web/data";

export default async function Index() {
  await connection();
  const rows = await listRestaurants();
  return (
    <div className="index">
      {rows.map((r) => (
        <Link className="row" href={`/r/${r.slug}`} key={r.slug}>
          <span>
            <b>{r.name}</b>
            <span className="small muted"> · {[r.area, r.format].filter(Boolean).join(" · ")}</span>
          </span>
          {r.state === "verdict" && r.tier ? (
            <TierBadge tier={r.tier as Tier} dashed />
          ) : r.state === "not_enough_evidence" ? (
            <span className="nee">Not enough evidence</span>
          ) : (
            <span className="small muted">No Verdict yet</span>
          )}
        </Link>
      ))}
      {rows.length === 0 && <p className="muted">No Restaurants yet.</p>}
    </div>
  );
}
