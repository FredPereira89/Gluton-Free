-- Keep the dish/dietary pass independent from the frozen Review extractor.
-- Rows are queued only for Reviews inserted after this migration; historical Reviews are not backfilled here.
create table review_dish_dietary (
  review_id          bigint primary key references review (id) on delete cascade,
  pass_version       text,
  standout_dishes    jsonb not null default '[]'::jsonb check (jsonb_typeof(standout_dishes) = 'array'),
  dietary_praise     text[] not null default '{}',
  dietary_complaints text[] not null default '{}',
  analysed_at        timestamptz,
  check ((pass_version is null) = (analysed_at is null))
);

create function queue_review_dish_dietary() returns trigger language plpgsql as $$
begin
  if new.text is not null then
    insert into review_dish_dietary (review_id) values (new.id) on conflict (review_id) do nothing;
  end if;
  return new;
end $$;

create trigger review_dish_dietary_queue
  after insert on review
  for each row execute function queue_review_dish_dietary();

alter table review_dish_dietary enable row level security;
