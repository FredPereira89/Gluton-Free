-- A failed Job exposes only a `code` + `detail` pair, never a vendor payload. `failed_stage`
-- records which macro Lookup stage was running, so a retry can resume without re-paying for it.
alter table job rename column error to error_detail;
alter table job add column error_code text;
alter table job add column failed_stage text check (failed_stage in ('ingest', 'extract', 'judge'));

-- A failed-lookup Owner question is not tied to one Source.
alter table owner_question alter column source_code drop not null;
alter table owner_question drop constraint owner_question_kind_check;
alter table owner_question add constraint owner_question_kind_check
  check (kind in ('listing_match', 'failed_lookup'));
create unique index owner_question_failed_lookup_open_idx on owner_question (restaurant_id)
  where status = 'open' and kind = 'failed_lookup';
