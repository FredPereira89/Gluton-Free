-- Gluton-Free data model (see "Data model and storage budget").
-- No reviewer identity anywhere: no names, avatars, profile URLs, reviewer IDs or Review permalinks.
-- Raw vendor payloads are never stored.

create table source (
  code   text primary key,
  name   text not null,
  kind   text not null check (kind in ('crowd', 'editorial')),
  access text not null check (access in ('public_ok', 'personal_only'))
);

create table restaurant (
  id                bigint generated always as identity primary key,
  slug              text not null unique,
  name              text not null,
  city              text not null,
  area              text,
  address           text,
  lat               double precision,
  lng               double precision,
  status            text not null default 'open'
                    check (status in ('open', 'temporarily_closed', 'permanently_closed')),
  format            text not null,
  format_provenance text not null check (format_provenance in ('llm', 'owner', 'baseline_auto')),
  format_changed_at timestamptz not null default now(),
  price_tier        text check (price_tier in ('€', '€€', '€€€', '€€€€')),
  price_provenance  text check (price_provenance in ('llm', 'owner', 'source')),
  created_at        timestamptz not null default now()
);

create table listing (
  id                  bigint generated always as identity primary key,
  restaurant_id       bigint not null references restaurant (id),
  source_code         text not null references source (code),
  place_ref           text not null,             -- the Source's own place ID / path
  url                 text not null,             -- the Restaurant's page on the Source
  match_provenance    text not null check (match_provenance in ('pasted', 'proposed_confirmed')),
  source_rating       numeric(3, 2),
  source_review_count integer,
  source_text_count   integer,
  newest_review_at    timestamptz,
  fetch_cursor        text,
  fetch_status        text not null default 'not_fetched'
                      check (fetch_status in ('not_fetched', 'fetching', 'fetched', 'failed')),
  fetch_error         text,
  last_fetched_at     timestamptz,
  categories          text[],
  price_level         text,
  closed_flag         boolean,
  unique (restaurant_id, source_code),
  unique (source_code, place_ref)
);

create table review (
  id                     bigint generated always as identity primary key,
  listing_id             bigint not null references listing (id),
  source_review_id       text not null,
  stars                  smallint check (stars between 1 and 5),
  published_at           timestamptz not null,
  language               text,
  text                   text,                     -- scrubbed; null for rating-only Reviews
  sub_ratings            jsonb,                    -- raw 1-5 by Aspect, e.g. {"food":5,"service":4}
  reviewer_review_count  integer,                  -- credibility whitelist from here down
  local_guide            boolean,
  reviewer_contributions integer,
  photo_count            integer,
  visited_on             date,
  owner_replied          boolean not null default false,
  fetched_at             timestamptz not null default now(),
  unique (listing_id, source_review_id)
);
create index review_listing_published on review (listing_id, published_at desc);

-- Reviews are immutable once fetched. Only the text may change: name redaction after
-- extraction, and nulling old text under the storage overflow plan.
create function review_immutable() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'text') is distinct from (to_jsonb(old) - 'text') then
    raise exception 'review rows are immutable (only text may be redacted or nulled)';
  end if;
  return new;
end $$;
create trigger review_immutable before update on review
  for each row execute function review_immutable();

create table review_analysis (
  review_id         bigint primary key references review (id) on delete cascade,
  extractor_version text not null,              -- model ID + schema + Theme vocabulary version
  food              smallint check (food between -2 and 2),
  service           smallint check (service between -2 and 2),
  ambience          smallint check (ambience between -2 and 2),
  value             smallint check (value between -2 and 2),
  wait              smallint check (wait between -2 and 2),
  consistency       smallint check (consistency between -2 and 2),
  exceptional       text not null check (exceptional in ('none', 'food', 'service', 'overall')),
  themes            text[] not null default '{}',
  quote             text,
  quote_aspect      text,
  quote_polarity    smallint check (quote_polarity in (-1, 1)),
  quote_en          text,                        -- translated at most once
  analysed_at       timestamptz not null default now()
);

create table review_flag (
  id               bigint generated always as identity primary key,
  review_id        bigint not null references review (id) on delete cascade,
  type             text not null check (type in ('food_poisoning', 'hygiene', 'scam_overcharge', 'other_safety')),
  flag_group       text not null check (flag_group in ('health', 'money')),
  first_hand       boolean not null,
  severity         text not null check (severity in ('low', 'medium', 'high')),
  evidence         text not null,
  verification     text not null default 'pending' check (verification in ('pending', 'confirmed', 'rejected')),
  verifier_version text,
  verified_at      timestamptz,
  unique (review_id, type)
);

create table job (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind in ('lookup', 'refresh', 'baseline', 'snapshot')),
  restaurant_id    bigint references restaurant (id),
  step             text,
  progress         jsonb not null default '{}',   -- per-Source fetched / expected
  status           text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  error            text,
  trigger_run_id   text,
  llm_usage        jsonb not null default '[]',   -- one entry per model call or batch
  vendor_cost_usd  numeric(10, 5) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create table verdict (
  id               bigint generated always as identity primary key,
  restaurant_id    bigint not null references restaurant (id),
  job_id           bigint references job (id),
  peer_snapshot_id bigint,                       -- null while provisional
  state            text not null check (state in ('verdict', 'not_enough_evidence')),
  tier             text check (tier in ('avoid', 'ok', 'good', 'must_go', 'life_changing')),
  confidence       text check (confidence in ('low', 'medium', 'high')),
  provisional      boolean not null,
  blocks           jsonb not null,               -- zod-validated: inputs, caps, red flags, bars, themes, quotes, series
  explanation      text,
  inputs_hash      text not null,
  created_at       timestamptz not null default now()
);
create index verdict_latest on verdict (restaurant_id, id desc);

create table distinction (
  id            bigint generated always as identity primary key,
  restaurant_id bigint not null references restaurant (id),
  guide         text not null,
  level         text not null,
  edition_year  integer,
  url           text not null
);

create table critic_piece (
  id             bigint generated always as identity primary key,
  restaurant_id  bigint not null references restaurant (id),
  publication    text not null,
  title          text not null,
  url            text not null,
  published_on   date,
  language       text,
  printed_rating text                            -- display only, never parsed
);

-- Single-tenant: RLS on everywhere with no policies, so the Data API exposes nothing.
-- The server connects as the database owner through the session pooler.
alter table source          enable row level security;
alter table restaurant      enable row level security;
alter table listing         enable row level security;
alter table review          enable row level security;
alter table review_analysis enable row level security;
alter table review_flag     enable row level security;
alter table job             enable row level security;
alter table verdict         enable row level security;
alter table distinction     enable row level security;
alter table critic_piece    enable row level security;
