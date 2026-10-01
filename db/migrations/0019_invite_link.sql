-- An Invite link is a revocable token the Owner hands out (ADR 0008). Redeeming one sends a
-- magic link; the first sign-in records an Invitee tied to it and bumps use_count. use_cap is the
-- most people it may admit (null = unlimited).
create table invite_link (
  id          bigint generated always as identity primary key,
  token       text not null unique,
  label       text not null,
  use_cap     integer check (use_cap > 0),
  use_count   integer not null default 0,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (use_cap is null or use_count <= use_cap)
);

-- Deny-all: no policies, so the Data API exposes nothing (ADR 0006).
alter table invite_link enable row level security;

-- Who an Invitee is: their email, the link they came in through, and when they were last seen.
-- joined = invitee.created_at.
alter table invitee
  add column email           text,
  add column invite_link_id  bigint references invite_link(id),
  add column last_seen_at    timestamptz;
