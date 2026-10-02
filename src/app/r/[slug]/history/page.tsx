// The Verdict history screen: every Verdict ever issued for a Restaurant, newest first.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfChip, dateLabel, TierBadge } from "@/web/atoms";
import { loadVerdictHistory } from "@/web/data";
import { pageRole } from "@/lib/page-role";
import { InviteeView } from "@/web/invitee-view";
import { pageIdPagination, type PageSearchParams } from "@/web/pagination";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<PageSearchParams> };

export const metadata: Metadata = { title: "Verdict history · Gluton-Free" };

export default async function VerdictHistoryPage({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const pagination = pageIdPagination(await searchParams);
  const [role, history] = await Promise.all([pageRole(), loadVerdictHistory(slug, pagination)]);
  if (!history) notFound();
  const restaurantHref = `/r/${encodeURIComponent(history.restaurant.slug)}`;
  const next = new URLSearchParams({ cursor: history.nextCursor ?? "", limit: String(pagination.limit) });

  return (
    <div className="A history">
      {role === "invitee" && <InviteeView />}
      <section className="hero">
        <p><Link className="btn btn-secondary report-back" href={restaurantHref}>Back to report</Link></p>
        <div className="name">
          <h1>Verdict history</h1>
          <p>
            <Link href={restaurantHref}>{history.restaurant.name}</Link>
          </p>
        </div>
      </section>
      <section className="sec">
        {history.items.length === 0 ? (
          <div className="dir-empty">
            <p><strong>{pagination.cursor ? "No older Verdicts." : "No Verdict yet."}</strong></p>
            {!pagination.cursor && <p className="small muted">A Verdict appears here once there is enough evidence to issue one.</p>}
          </div>
        ) : (
          <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Verdict history">
            <table className="src">
              <thead>
                <tr>
                  <th>Issued</th>
                  <th>Tier</th>
                  <th>Confidence</th>
                  <th>{role === "invitee" ? "Early verdict" : "Provisional"}</th>
                  {role !== "invitee" && <th>Peer snapshot</th>}
                </tr>
              </thead>
              <tbody>
                {history.items.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Issued">{dateLabel(v.issuedAt)}</td>
                    <td data-label="Tier">
                      {v.state === "verdict" && v.tier ? (
                        <TierBadge tier={v.tier} dashed={v.provisional} />
                      ) : (
                        <span className="chip nee-chip">Not enough evidence</span>
                      )}
                    </td>
                    <td data-label="Confidence">{v.confidence ? <ConfChip level={v.confidence} /> : <span className="muted">—</span>}</td>
                    <td data-label={role === "invitee" ? "Early verdict" : "Provisional"}>{v.provisional ? <span className="chip prov">{role === "invitee" ? "Early verdict" : "Provisional"}</span> : <span className="muted">—</span>}</td>
                    {role !== "invitee" && <td data-label="Peer snapshot">{v.peerSnapshotId === null ? <span className="muted">—</span> : `Peer snapshot #${v.peerSnapshotId}`}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.nextCursor && (
          <Link className="btn btn-secondary next-page" href={`${restaurantHref}/history?${next}`}>Older Verdicts</Link>
        )}
      </section>
    </div>
  );
}
