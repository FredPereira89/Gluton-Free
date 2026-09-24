// The Verdict history screen: every Verdict ever issued for a Restaurant, newest first.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfChip, dateLabel, TierBadge } from "@/web/atoms";
import { loadVerdictHistory } from "@/web/data";
import { pageIdPagination, type PageSearchParams } from "@/web/pagination";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<PageSearchParams> };

export const metadata: Metadata = { title: "Verdict history · Gluton-Free" };

export default async function VerdictHistoryPage({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const pagination = pageIdPagination(await searchParams);
  const history = await loadVerdictHistory(slug, pagination);
  if (!history) notFound();
  const restaurantHref = `/r/${encodeURIComponent(history.restaurant.slug)}`;
  const next = new URLSearchParams({ cursor: history.nextCursor ?? "", limit: String(pagination.limit) });

  return (
    <div className="A history">
      <section className="hero">
        <div className="name">
          <h1>Verdict history</h1>
          <p>
            <Link href={restaurantHref}>{history.restaurant.name}</Link>
          </p>
        </div>
      </section>
      <section className="sec">
        {history.items.length === 0 ? (
          <p className="muted">{pagination.cursor ? "No older Verdicts." : "No Verdict yet."}</p>
        ) : (
          <div className="tbl-wrap">
            <table className="src">
              <thead>
                <tr>
                  <th>Issued</th>
                  <th>Tier</th>
                  <th>Confidence</th>
                  <th>Provisional</th>
                  <th>Peer snapshot</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((v) => (
                  <tr key={v.id}>
                    <td>{dateLabel(v.issuedAt)}</td>
                    <td>
                      {v.state === "verdict" && v.tier ? (
                        <TierBadge tier={v.tier} dashed={v.provisional} />
                      ) : (
                        <span className="nee">Not enough evidence</span>
                      )}
                    </td>
                    <td>{v.confidence ? <ConfChip level={v.confidence} /> : "—"}</td>
                    <td>{v.provisional ? <span className="chip prov">Provisional</span> : "—"}</td>
                    <td>{v.peerSnapshotId === null ? "—" : `Peer snapshot #${v.peerSnapshotId}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.nextCursor && (
          <Link className="next-page" href={`${restaurantHref}/history?${next}`}>Older Verdicts</Link>
        )}
      </section>
    </div>
  );
}
