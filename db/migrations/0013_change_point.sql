create table change_point (
  id            bigint generated always as identity primary key,
  restaurant_id bigint not null references restaurant (id),
  kind          text not null check (kind in ('reopened', 'new_owner', 'new_chef', 'new_concept', 'moved')),
  date          date not null,
  provenance    text not null check (provenance in ('proposed_confirmed', 'declared')),
  confirmed_at  timestamptz not null default now(),
  deleted_at    timestamptz
);
-- "Only the newest Change point matters" (ADR 0007): this ordering is how every reader finds it.
-- Deletes are soft (deleted_at) so a Verdict row keeps recording the Change point in force
-- when it was issued, per ADR 0007's "Each Verdict row records the Change point in force".
create index change_point_newest on change_point (restaurant_id, date desc, id desc) where deleted_at is null;

alter table verdict add column change_point_id bigint references change_point (id);

alter table change_point enable row level security;
