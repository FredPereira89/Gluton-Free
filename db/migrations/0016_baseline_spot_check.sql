-- Keep the paid Lisbon sample distinguishable from later owner Lookups.
alter table restaurant add column baseline_sampled boolean not null default false;

-- Do not infer membership from Listings: owner Lookups use the same provenance.
create view baseline_spot_check_eligible with (security_invoker = true) as
select r.id as restaurant_id, r.format,
  (r.format_provenance = 'llm') as format_eligible,
  t.id as tripadvisor_listing_id, t.url as tripadvisor_url
from restaurant r
join listing g on g.restaurant_id = r.id and g.source_code = 'google'
left join listing t on t.restaurant_id = r.id and t.source_code = 'tripadvisor'
  and t.match_provenance = 'auto_accepted'
where r.baseline_sampled;

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
