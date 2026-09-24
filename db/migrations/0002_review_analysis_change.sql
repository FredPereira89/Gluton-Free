alter table review_analysis
  add column change text not null default 'none'
    check (change in ('none', 'new_owner', 'new_chef', 'renovated', 'new_concept', 'moved'));
