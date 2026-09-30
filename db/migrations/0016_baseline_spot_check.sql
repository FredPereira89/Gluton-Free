-- Keep the paid Lisbon sample distinguishable from later owner Lookups.
alter table restaurant add column baseline_sampled boolean not null default false;

-- Earlier baseline runs did not record membership. Their Google Listing and
-- LLM-confirmed Format identify the stored sample for a one-time backfill.
update restaurant r set baseline_sampled = true
where r.city = 'Lisbon' and r.format_provenance = 'llm'
  and exists (select 1 from listing l where l.restaurant_id = r.id
    and l.source_code = 'google' and l.match_provenance = 'auto_accepted');

create table baseline_spot_check (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('format', 'tripadvisor_match')),
  restaurant_id bigint not null references restaurant (id),
  listing_id bigint,
  listing_url text,
  proposed_format text,
  agreed boolean,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, restaurant_id),
  check ((kind = 'format' and listing_id is null and listing_url is null and proposed_format is not null)
    or (kind = 'tripadvisor_match' and listing_id is not null and listing_url is not null and proposed_format is null)),
  check ((agreed is null) = (answered_at is null))
);
alter table baseline_spot_check enable row level security;
