create table database_size_sample (
  id bigint generated always as identity primary key,
  sampled_at timestamptz not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  above_threshold boolean not null,
  created_at timestamptz not null default now()
);

alter table database_size_sample enable row level security;
