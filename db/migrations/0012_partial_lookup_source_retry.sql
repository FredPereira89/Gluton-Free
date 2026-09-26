alter table owner_question drop constraint owner_question_kind_check;
alter table owner_question add constraint owner_question_kind_check
  check (kind in ('listing_match', 'format', 'failed_lookup', 'retry_source'));
