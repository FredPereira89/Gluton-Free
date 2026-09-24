import { db } from "@/lib/db";
import { INPUTS } from "@/domain/aspects";
import type { PeerSnapshot } from "./peer";

/** Latest published snapshot. The reader never mixes groups from separate months. */
export async function loadCurrentPeerSnapshot(): Promise<PeerSnapshot | null> {
  const sql = db();
  const [snapshot] = await sql`
    select id, to_char(month, 'YYYY-MM') as month, published_at
    from peer_snapshot order by published_at desc, id desc limit 1`;
  if (!snapshot) return null;
  const rows = await sql`
    select city, level, group_key, input, sorted_theta, format_mean, shrink_k,
           composite, exceptional_prior, peer_count
    from peer_group_stat where snapshot_id = ${snapshot.id}`;
  return {
    id: Number(snapshot.id), month: snapshot.month as string, publishedAt: (snapshot.published_at as Date).toISOString(),
    groups: rows.map((row) => {
      if (!INPUTS.includes(row.input as typeof INPUTS[number])) throw new Error(`unknown Peer input ${row.input}`);
      return {
        city: row.city as string, level: row.level as "format" | "family" | "city", key: row.group_key as string,
        input: row.input as typeof INPUTS[number], sortedTheta: row.sorted_theta as number[],
        formatMean: Number(row.format_mean), k: Number(row.shrink_k), composite: row.composite as number[],
        exceptionalPrior: row.exceptional_prior as { alpha: number; beta: number }, peerCount: Number(row.peer_count),
      };
    }),
  };
}
