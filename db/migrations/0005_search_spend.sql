-- A small daily counter for search vendor spend (the job ledger only covers lookup/refresh/
-- baseline/snapshot jobs; search never creates a job row), read together for the daily
-- vendor-spend cap (issue #46).
create table search_cost_daily (
  day      date primary key,
  cost_usd numeric(10, 5) not null default 0
);

alter table search_cost_daily enable row level security;
