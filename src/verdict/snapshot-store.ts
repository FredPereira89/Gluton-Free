import { db } from "@/lib/db";
import { INPUTS, type Aspect } from "@/domain/aspects";
import type { PeerSnapshot } from "./peer";
import { MONTH_MS, PARAMS, type RollupReview } from "./rollup";
import { assertSnapshotSize, type BuiltPeerSnapshot, type PeerCandidate } from "./snapshot-build";

// Reviews older than the Review window's age cap (ADR 0004) never count, so the Peer sweep does
// not load them; one extra month covers the window's month arithmetic.
const PEER_REVIEW_LOOKBACK_MONTHS = PARAMS.reviewWindowMaxAgeMonths + 1;

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

/** Every Restaurant that could be a Peer, with the Reviews a Review window could still count and its own newest confirmed Change point. */
export async function loadPeerCandidates(now = new Date()): Promise<PeerCandidate[]> {
  const sql = db();
  const restaurants = await sql`
    select r.id, r.city, r.format, r.status, cp.date as change_point_at
    from restaurant r
    left join lateral (
      select date from change_point where restaurant_id = r.id and deleted_at is null order by date desc, id desc limit 1
    ) cp on true
    where r.status <> 'permanently_closed'`;
  const rows = await sql`
    select l.restaurant_id, r.id, l.source_code, r.published_at, r.stars, r.text is not null as has_text, r.sub_ratings,
           a.food, a.service, a.ambience, a.value, a.wait, a.consistency, a.exceptional, a.themes,
           a.review_id is not null as analysed
    from review r
    join listing l on l.id = r.listing_id
    join restaurant rs on rs.id = l.restaurant_id and rs.status <> 'permanently_closed'
    left join review_analysis a on a.review_id = r.id
    where r.published_at >= ${new Date(now.getTime() - PEER_REVIEW_LOOKBACK_MONTHS * MONTH_MS)}`;
  const byRestaurant = new Map<number, RollupReview[]>();
  for (const r of rows) {
    const review: RollupReview = {
      id: Number(r.id), source: r.source_code as string, publishedAt: r.published_at as Date, stars: r.stars as number | null,
      hasText: r.has_text as boolean, subRatings: (r.sub_ratings ?? null) as Partial<Record<Aspect, number>> | null,
      aspects: r.analysed ? { food: r.food, service: r.service, ambience: r.ambience, value: r.value, wait: r.wait, consistency: r.consistency } : null,
      exceptional: (r.exceptional ?? null) as RollupReview["exceptional"], themes: (r.themes ?? []) as string[],
    };
    const list = byRestaurant.get(Number(r.restaurant_id));
    if (list) list.push(review);
    else byRestaurant.set(Number(r.restaurant_id), [review]);
  }
  return restaurants.map((r) => ({
    id: Number(r.id), city: r.city as string, format: r.format as string, status: r.status as PeerCandidate["status"],
    reviews: byRestaurant.get(Number(r.id)) ?? [], changePointAt: r.change_point_at ? new Date(r.change_point_at as string) : null,
  }));
}

/**
 * Keeps a built snapshot (all snapshots are kept, ADR 0003) and returns its id. This makes it the
 * latest snapshot `loadCurrentPeerSnapshot` reads; re-judging every Verdict against it is the
 * publish step's job (issue #70).
 */
export async function storePeerSnapshot(snapshot: BuiltPeerSnapshot): Promise<number> {
  assertSnapshotSize(snapshot);
  const sql = db();
  return sql.begin(async (tx) => {
    const [row] = await tx`insert into peer_snapshot (month) values (${`${snapshot.month}-01`}) returning id`;
    const id = Number(row!.id);
    if (snapshot.groups.length) {
      await tx`insert into peer_group_stat ${tx(snapshot.groups.map((g) => ({
        snapshot_id: id, city: g.city, level: g.level, group_key: g.key, input: g.input,
        sorted_theta: tx.json(g.sortedTheta), format_mean: g.formatMean, shrink_k: g.k,
        composite: tx.json(g.composite), exceptional_prior: tx.json(g.exceptionalPrior), peer_count: g.peerCount,
      })))}`;
    }
    // Postgres caps a statement at 65,535 parameters, so members go in chunks.
    for (let i = 0; i < snapshot.members.length; i += 5000) {
      await tx`insert into peer_snapshot_member ${tx(snapshot.members.slice(i, i + 5000).map((m) => ({
        snapshot_id: id, restaurant_id: m.restaurantId, city: m.city, format: m.format,
      })))}`;
    }
    return id;
  });
}
