-- #53 (format questions) and #54 (failed-lookup questions) each independently narrowed
-- owner_question_kind_check on top of 0007, so one branch's kind silently dropped the other's.
-- Reconcile to the union.
alter table owner_question drop constraint owner_question_kind_check;
alter table owner_question add constraint owner_question_kind_check
  check (kind in ('listing_match', 'format', 'failed_lookup'));
