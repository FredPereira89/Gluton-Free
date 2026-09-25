-- ADR-0005: a Lookup never waits for the owner. Uncertain Listing matches raise a question
-- beside the job model instead of blocking it, and get answered later without a needs_input status.
alter table job drop constraint job_kind_check;
alter table job add constraint job_kind_check
  check (kind in ('lookup', 'refresh', 'baseline', 'snapshot', 'listing_fetch', 'rejudge'));

create table owner_question (
  id            bigint generated always as identity primary key,
  restaurant_id bigint not null references restaurant (id),
  kind          text not null check (kind in ('listing_match')),
  source_code   text not null references source (code),
  payload       jsonb not null,
  status        text not null default 'open' check (status in ('open', 'answered', 'dismissed')),
  raised_at     timestamptz not null default now(),
  settled_at    timestamptz
);
create unique index owner_question_open_idx on owner_question (restaurant_id, source_code, kind) where status = 'open';

alter table owner_question enable row level security;
