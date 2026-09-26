alter table change_point drop constraint change_point_kind_check;
alter table change_point add constraint change_point_kind_check
  check (kind in ('reopened', 'renovated', 'new_owner', 'new_chef', 'new_concept', 'moved'));

alter table owner_question drop constraint owner_question_kind_check;
alter table owner_question add constraint owner_question_kind_check
  check (kind in ('listing_match', 'format', 'failed_lookup', 'retry_source', 'change_point'));
create unique index owner_question_open_change_point on owner_question (restaurant_id)
  where status = 'open' and kind = 'change_point';
