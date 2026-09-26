create table push_subscription (
  id             bigint generated always as identity primary key,
  owner_user_id  uuid not null,
  type           text not null check (type in ('web')),
  endpoint       text not null,
  p256dh_key     text not null,
  auth_key       text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_user_id, endpoint)
);

alter table push_subscription enable row level security;
