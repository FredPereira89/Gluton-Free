import { CHANGE_MARKERS, type ChangeMarker, type ChangePointKind } from "@/domain/aspects";
import { db } from "./db";
import { sendPush } from "./push-send";

export type ChangeReview = { publishedAt: Date; change: ChangeMarker | null };
export type ChangeProposal = {
  kind: ChangePointKind;
  date: string;
  reason: "gap" | "mentions";
  mentionCount: number;
};

const DAY = 86_400_000;
const markerSet = new Set<string>(CHANGE_MARKERS);

function withinMonths(start: Date, end: Date, months: number): boolean {
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const limit = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  return end <= limit;
}

function month(date: Date): string {
  return `${date.toISOString().slice(0, 7)}-01`;
}

function kindFor(markers: ChangeMarker[]): ChangePointKind {
  const counts = new Map<ChangePointKind, number>();
  for (const marker of markers) if (marker !== "none") counts.set(marker, (counts.get(marker) ?? 0) + 1);
  const winner = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return winner ?? "reopened";
}

/** Uses every Source together; stars are deliberately absent from the input. */
export function proposeChangePoint(reviews: ChangeReview[]): ChangeProposal | null {
  const ordered = [...reviews].filter((r) => Number.isFinite(r.publishedAt.getTime()))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  if (!ordered.length) return null;
  const mentions = ordered.filter((r) => r.change && r.change !== "none" && markerSet.has(r.change));
  const mentionCount = mentions.length;
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) gaps.push(ordered[i]!.publishedAt.getTime() - ordered[i - 1]!.publishedAt.getTime());
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2 : Infinity;
  let gap: ChangeProposal | null = null;
  for (let i = 1; i < ordered.length; i++) {
    const distance = gaps[i - 1]!;
    if (distance < 56 * DAY || distance < 4 * median) continue;
    const reopening = ordered[i]!.publishedAt;
    const nearby = mentions.filter((r) => r.publishedAt >= reopening && withinMonths(reopening, r.publishedAt, 6));
    gap = { kind: nearby.length ? kindFor(nearby.map((r) => r.change!)) : "reopened",
      date: reopening.toISOString().slice(0, 10), reason: "gap", mentionCount };
  }
  let mention: ChangeProposal | null = null;
  for (let i = 0; i <= mentions.length - 3;) {
    const group = mentions.filter((r) => r.publishedAt >= mentions[i]!.publishedAt && withinMonths(mentions[i]!.publishedAt, r.publishedAt, 6));
    if (group.length >= 3) {
      mention = { kind: kindFor(group.map((r) => r.change!)), date: month(mentions[i]!.publishedAt), reason: "mentions", mentionCount };
      i += group.length;
    } else {
      i++;
    }
  }
  if (gap && mention) return gap.date >= mention.date ? gap : mention;
  return gap ?? mention;
}

/** Run after a looked-up Restaurant is judged. Baseline Peers have no lookup job. */
export async function raiseChangePointProposal(restaurantId: number): Promise<number | undefined> {
  const sql = db();
  const [lookedUp] = await sql`select id from job where restaurant_id = ${restaurantId} and kind = 'lookup' limit 1`;
  if (!lookedUp) return undefined;
  const rows = await sql`
    select r.published_at, a.change
    from review r join listing l on l.id = r.listing_id
    left join review_analysis a on a.review_id = r.id
    where l.restaurant_id = ${restaurantId}
    order by r.published_at, r.id`;
  const proposal = proposeChangePoint(rows.map((r) => ({ publishedAt: r.published_at as Date, change: r.change as ChangeMarker | null })));
  if (!proposal) return undefined;
  const id = await sql.begin(async (tx) => {
    const [restaurant] = await tx`select id from restaurant where id = ${restaurantId} for update`;
    if (!restaurant) return undefined;
    const [newest] = await tx`
      select date from change_point where restaurant_id = ${restaurantId} and deleted_at is null
      order by date desc, id desc limit 1`;
    if (newest && new Date(newest.date as string).toISOString().slice(0, 10) >= proposal.date) return undefined;
    const [lastConfirmed] = await tx`
      select payload from owner_question where restaurant_id = ${restaurantId} and kind = 'change_point' and status = 'answered'
      order by id desc limit 1`;
    if (lastConfirmed && (lastConfirmed.payload as { date: string }).date >= proposal.date) return undefined;
    const [lastRejected] = await tx`
      select payload from owner_question where restaurant_id = ${restaurantId} and kind = 'change_point' and status = 'dismissed'
      order by id desc limit 1`;
    if (lastRejected && proposal.mentionCount - Number((lastRejected.payload as { mentionCount: number }).mentionCount) < 3) return undefined;
    const [created] = await tx`
      insert into owner_question (restaurant_id, kind, payload)
      values (${restaurantId}, 'change_point', ${tx.json(proposal as never)})
      on conflict (restaurant_id) where status = 'open' and kind = 'change_point' do nothing
      returning id`;
    return created ? Number(created.id) : undefined;
  });
  if (id) await sendPush("owner_question", restaurantId, id);
  return id;
}
