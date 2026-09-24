create table peer_snapshot (
  id bigint generated always as identity primary key,
  month date not null check (extract(day from month) = 1),
  published_at timestamptz not null default now()
);
create index peer_snapshot_month on peer_snapshot (month desc, published_at desc);

create table peer_group_stat (
  snapshot_id bigint not null references peer_snapshot (id),
  city text not null,
  level text not null check (level in ('format', 'family', 'city')),
  group_key text not null,
  input text not null check (input in ('food', 'service', 'overall', 'value', 'ambience', 'wait')),
  sorted_theta jsonb not null check (jsonb_typeof(sorted_theta) = 'array'),
  format_mean double precision not null,
  shrink_k double precision not null check (shrink_k >= 0),
  composite jsonb not null check (jsonb_typeof(composite) = 'array'),
  exceptional_prior jsonb not null check (jsonb_typeof(exceptional_prior) = 'object'),
  peer_count integer not null check (peer_count >= 0),
  primary key (snapshot_id, city, level, group_key, input)
);

create table peer_snapshot_member (
  snapshot_id bigint not null references peer_snapshot (id),
  restaurant_id bigint not null references restaurant (id),
  city text not null,
  format text not null,
  primary key (snapshot_id, restaurant_id)
);
create index peer_snapshot_member_restaurant on peer_snapshot_member (restaurant_id, snapshot_id);

alter table verdict add constraint verdict_peer_snapshot_id_fkey
  foreign key (peer_snapshot_id) references peer_snapshot (id);

alter table peer_snapshot enable row level security;
alter table peer_group_stat enable row level security;
alter table peer_snapshot_member enable row level security;
