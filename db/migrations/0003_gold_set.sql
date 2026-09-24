-- The extractor's gold set (issue #28): a frozen sample of scrubbed text Reviews, kept with the
-- extractor version that produced their baseline output, so a candidate model or schema can be
-- compared against it before a switch. `baseline` holds the GoldBaseline shape from
-- src/analysis/gold-set.ts: aspects, exceptional, change, themes, flags, quote. No reviewer
-- identity: `text` is the already-redacted review.text, and `baseline` carries no name spans.
create table gold_review (
  id                bigint generated always as identity primary key,
  review_id         bigint not null references review (id) on delete cascade,
  source_code       text not null,
  language          text not null,
  text              text not null,
  stars             smallint check (stars between 1 and 5),
  extractor_version text not null,
  baseline          jsonb not null,
  selected_at       timestamptz not null default now(),
  unique (review_id)
);
create index gold_review_extractor on gold_review (extractor_version);

alter table gold_review enable row level security;
