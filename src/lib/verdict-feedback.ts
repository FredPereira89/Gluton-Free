import type { Tier } from "@/domain/aspects";
import type { VerdictFeedback, VerdictFeedbackJudgement, VerdictFeedbackSubmission } from "./api-contract";
import { db } from "./db";

type FeedbackRow = {
  feedback_id: string | null;
  verdict_id: string | null;
  judgement: VerdictFeedbackJudgement | null;
  eaten_here: boolean | null;
  note: string | null;
  submitted_at: Date | null;
};

function toFeedback(row: FeedbackRow): VerdictFeedback {
  if (row.feedback_id === null || row.verdict_id === null || row.judgement === null || row.submitted_at === null) {
    throw new Error("Incomplete verdict feedback row");
  }
  return {
    verdictId: Number(row.verdict_id),
    judgement: row.judgement,
    eatenHere: row.eaten_here,
    note: row.note,
    submittedAt: row.submitted_at.toISOString(),
  };
}

/** Read only this caller's one feedback entry for the Restaurant. */
export async function getVerdictFeedback(inviteeId: string, slug: string): Promise<{ found: boolean; feedback: VerdictFeedback | null }> {
  const [row] = await db()<({ restaurant_id: string } & FeedbackRow)[]>`
    select r.id as restaurant_id, f.id as feedback_id, f.verdict_id, f.judgement,
           f.eaten_here, f.note, f.submitted_at
    from restaurant r
    left join verdict_feedback f on f.restaurant_id = r.id and f.invitee_id = ${inviteeId}
    where r.slug = ${slug}
  `;
  if (!row) return { found: false, feedback: null };
  return { found: true, feedback: row.feedback_id === null ? null : toFeedback(row) };
}

/**
 * Save feedback only when the report still shows the Restaurant's latest issued Verdict.
 * This statement writes only verdict_feedback; a feedback submission never updates a Verdict.
 */
export async function saveVerdictFeedback(
  inviteeId: string,
  slug: string,
  input: VerdictFeedbackSubmission,
): Promise<{ found: boolean; currentVerdictId: number | null; feedback: VerdictFeedback | null }> {
  type SaveRow = FeedbackRow & { restaurant_id: string; current_verdict_id: string | null };
  const [row] = await db()<SaveRow[]>`
    with current as (
      select r.id as restaurant_id, latest.id as latest_verdict_id,
             latest.state as latest_state, latest.tier as latest_tier
      from restaurant r
      left join lateral (
        select id, state, tier from verdict where restaurant_id = r.id order by id desc limit 1
      ) latest on true
      where r.slug = ${slug}
    ), saved as (
      insert into verdict_feedback (invitee_id, restaurant_id, verdict_id, judgement, eaten_here, note)
      select ${inviteeId}, c.restaurant_id, c.latest_verdict_id,
             ${input.judgement}, ${input.eatenHere}, ${input.note}
      from current c
      where c.latest_verdict_id = ${input.verdictId}
        and c.latest_state = 'verdict' and c.latest_tier is not null
      on conflict (invitee_id, restaurant_id) do update set
        verdict_id = excluded.verdict_id,
        judgement = excluded.judgement,
        eaten_here = excluded.eaten_here,
        note = excluded.note,
        submitted_at = now()
      returning id, verdict_id, judgement, eaten_here, note, submitted_at
    )
    select c.restaurant_id, c.latest_verdict_id as current_verdict_id,
           s.id as feedback_id, s.verdict_id, s.judgement, s.eaten_here, s.note, s.submitted_at
    from current c left join saved s on true
  `;
  if (!row) return { found: false, currentVerdictId: null, feedback: null };
  return {
    found: true,
    currentVerdictId: row.current_verdict_id === null ? null : Number(row.current_verdict_id),
    feedback: row.feedback_id === null ? null : toFeedback(row),
  };
}

export type VerdictFeedbackInboxEntry = {
  userId: string;
  email: string | null;
  judgement: VerdictFeedbackJudgement;
  eatenHere: boolean | null;
  note: string | null;
  submittedAt: string;
};

export type VerdictFeedbackInboxGroup = {
  restaurantName: string;
  restaurantSlug: string;
  tier: Tier;
  total: number;
  counts: Record<VerdictFeedbackJudgement, number>;
  entries: VerdictFeedbackInboxEntry[];
};

type InboxRow = {
  invitee_user_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  tier: Tier;
  judgement: VerdictFeedbackJudgement;
  eaten_here: boolean | null;
  note: string | null;
  submitted_at: Date;
  email: string | null;
};

/** Owner inbox, grouped by Restaurant and the Tier of the Verdict each Invitee answered. */
export async function listVerdictFeedbackInbox(): Promise<VerdictFeedbackInboxGroup[]> {
  const rows = await db()<InboxRow[]>`
    select r.name as restaurant_name, r.slug as restaurant_slug, v.tier,
           f.judgement, f.eaten_here, f.note, f.submitted_at,
           i.user_id as invitee_user_id, i.email
    from verdict_feedback f
    join restaurant r on r.id = f.restaurant_id
    join verdict v on v.id = f.verdict_id
    join invitee i on i.user_id = f.invitee_id
    where v.tier is not null
    order by count(*) over (partition by r.id, v.tier) desc,
             r.name asc, v.tier asc, f.submitted_at desc
  `;

  const groups = new Map<string, VerdictFeedbackInboxGroup>();
  for (const row of rows) {
    const key = `${row.restaurant_slug}\u0000${row.tier}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        restaurantName: row.restaurant_name,
        restaurantSlug: row.restaurant_slug,
        tier: row.tier,
        total: 0,
        counts: { too_high: 0, about_right: 0, too_low: 0 },
        entries: [],
      };
      groups.set(key, group);
    }
    group.total += 1;
    group.counts[row.judgement] += 1;
    group.entries.push({
      userId: row.invitee_user_id,
      email: row.email,
      judgement: row.judgement,
      eatenHere: row.eaten_here,
      note: row.note,
      submittedAt: row.submitted_at.toISOString(),
    });
  }
  return [...groups.values()];
}
