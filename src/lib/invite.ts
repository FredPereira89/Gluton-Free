// Invite links and Invitees (ADR 0008): the Owner hands out revocable links; redeeming one sends a
// magic link, and the first sign-in records an Invitee tied to the link.
import { randomBytes } from "node:crypto";
import { db } from "./db";

export type InviteLink = {
  id: number;
  token: string;
  label: string;
  useCap: number | null;
  useCount: number;
  revoked: boolean;
  createdAt: string;
};

export type InviteeRecord = {
  userId: string;
  email: string | null;
  inviteLink: { id: number; label: string } | null;
  joinedAt: string;
  lastSeenAt: string | null;
  lockedOut: boolean;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

type LinkRow = { id: string; token: string; label: string; use_cap: number | null; use_count: number; revoked_at: Date | null; created_at: Date };

function inviteLink(row: LinkRow): InviteLink {
  return {
    id: Number(row.id), token: row.token, label: row.label, useCap: row.use_cap, useCount: row.use_count,
    revoked: row.revoked_at !== null, createdAt: row.created_at.toISOString(),
  };
}

export async function createInviteLink(label: string, useCap: number | null): Promise<InviteLink> {
  const [row] = await db()<LinkRow[]>`
    insert into invite_link (token, label, use_cap) values (${generateInviteToken()}, ${label}, ${useCap})
    returning id, token, label, use_cap, use_count, revoked_at, created_at`;
  if (!row) throw new Error("invite_link insert returned no row");
  return inviteLink(row);
}

export async function listInviteLinks(): Promise<InviteLink[]> {
  const rows = await db()<LinkRow[]>`
    select id, token, label, use_cap, use_count, revoked_at, created_at from invite_link order by id desc`;
  return rows.map(inviteLink);
}

/** Revoking is idempotent; false means no such link. */
export async function revokeInviteLink(id: number): Promise<boolean> {
  const rows = await db()`
    update invite_link set revoked_at = coalesce(revoked_at, now()) where id = ${id} returning id`;
  return rows.length > 0;
}

/** Whether a token names a link that is neither revoked nor at its use cap. */
export async function inviteLinkIsOpen(token: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token)) return false;
  const rows = await db()`
    select 1 from invite_link
    where token = ${token} and revoked_at is null and (use_cap is null or use_count < use_cap)`;
  return rows.length > 0;
}

export type JoinResult = "joined" | "existing" | "refused";

/**
 * Called when a person signs in through a magic link sent for an Invite link. One statement, so the
 * use cap holds under simultaneous sign-ins: a new person is recorded as an Invitee and the use
 * counted only if the link is still open; someone already recorded is let through without a use
 * (unless locked out); everyone else is refused and nothing is created.
 */
export async function joinWithInvite(input: { userId: string; email: string; token: string }): Promise<JoinResult> {
  if (!TOKEN_PATTERN.test(input.token)) return "refused";
  const [row] = await db()<{ existing: boolean; locked_out: boolean | null; created: boolean }[]>`
    with existing as (
      select locked_out from invitee where user_id = ${input.userId}
    ), link as (
      update invite_link set use_count = use_count + 1
      where token = ${input.token} and revoked_at is null and (use_cap is null or use_count < use_cap)
        and not exists (select 1 from existing)
      returning id
    ), created as (
      insert into invitee (user_id, email, invite_link_id, last_seen_at)
      select ${input.userId}, ${input.email}, id, now() from link
      returning user_id
    )
    select exists (select 1 from existing) as existing,
           (select locked_out from existing) as locked_out,
           exists (select 1 from created) as created`;
  if (row?.created) return "joined";
  return row?.existing && row.locked_out === false ? "existing" : "refused";
}

/** Whether an email belongs to a recorded Invitee who is not locked out (case-insensitive). */
export async function isInviteeEmail(email: string): Promise<boolean> {
  const rows = await db()`select 1 from invitee where lower(email) = lower(${email}) and not locked_out`;
  return rows.length > 0;
}

type InviteeRow = {
  user_id: string; email: string | null; invite_link_id: string | null; label: string | null;
  created_at: Date; last_seen_at: Date | null; locked_out: boolean;
};

function invitee(row: InviteeRow): InviteeRecord {
  return {
    userId: row.user_id, email: row.email,
    inviteLink: row.invite_link_id === null ? null : { id: Number(row.invite_link_id), label: row.label ?? "" },
    joinedAt: row.created_at.toISOString(), lastSeenAt: row.last_seen_at?.toISOString() ?? null, lockedOut: row.locked_out,
  };
}

export async function listInvitees(): Promise<InviteeRecord[]> {
  const rows = await db()<InviteeRow[]>`
    select i.user_id, i.email, i.invite_link_id, l.label, i.created_at, i.last_seen_at, i.locked_out
    from invitee i left join invite_link l on l.id = i.invite_link_id
    order by i.created_at desc, i.user_id`;
  return rows.map(invitee);
}

/** Locks an Invitee out (or lets them back in). Null means no such Invitee. */
export async function setInviteeLockedOut(userId: string, lockedOut: boolean): Promise<InviteeRecord | null> {
  const [row] = await db()<InviteeRow[]>`
    with changed as (
      update invitee set locked_out = ${lockedOut} where user_id = ${userId}
      returning user_id, email, invite_link_id, created_at, last_seen_at, locked_out
    )
    select c.user_id, c.email, c.invite_link_id, l.label, c.created_at, c.last_seen_at, c.locked_out
    from changed c left join invite_link l on l.id = c.invite_link_id`;
  return row ? invitee(row) : null;
}
