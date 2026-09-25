-- A Google Listing is the durable identity used to make lookup creation idempotent.
alter table listing drop constraint listing_match_provenance_check;
alter table listing add constraint listing_match_provenance_check
  check (match_provenance in ('pasted', 'proposed_confirmed', 'auto_accepted'));

insert into source (code, name, kind, access) values
  ('google', 'Google', 'crowd', 'personal_only'),
  ('tripadvisor', 'Tripadvisor', 'crowd', 'personal_only')
on conflict (code) do nothing;
