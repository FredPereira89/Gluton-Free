-- Durable reservations and provider batch IDs survive runner restarts.
create table dish_dietary_backfill (
  pass_version text primary key,
  ledger jsonb not null,
  updated_at timestamptz not null default now()
);
alter table dish_dietary_backfill enable row level security;
