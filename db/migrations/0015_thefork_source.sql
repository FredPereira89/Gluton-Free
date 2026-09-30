-- TheFork (via Apify) is a Crowd Source matched beside the Lookup (ADR-0005). Its search runs as
-- its own `source_match` Job so a slow or failed Apify call never blocks or fails the Verdict.
alter table job drop constraint job_kind_check;
alter table job add constraint job_kind_check
  check (kind in ('lookup', 'refresh', 'baseline', 'snapshot', 'listing_fetch', 'rejudge', 'source_match'));

insert into source (code, name, kind, access) values
  ('thefork', 'TheFork', 'crowd', 'personal_only')
on conflict (code) do nothing;
