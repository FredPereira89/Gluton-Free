-- One current Verdict feedback entry per Invitee and Restaurant. A later submission replaces
-- that Invitee's previous entry and records the Verdict and time they most recently answered for.
create table verdict_feedback (
  id            bigint generated always as identity primary key,
  invitee_id    uuid not null references invitee (user_id) on delete cascade,
  restaurant_id bigint not null references restaurant (id) on delete cascade,
  verdict_id    bigint not null references verdict (id),
  judgement     text not null check (judgement in ('too_high', 'about_right', 'too_low')),
  eaten_here    boolean,
  note          text check (note is null or char_length(note) <= 1000),
  submitted_at  timestamptz not null default now(),
  unique (invitee_id, restaurant_id)
);

-- Deny-all: no policies, so the Data API exposes nothing (ADR 0006).
alter table verdict_feedback enable row level security;
