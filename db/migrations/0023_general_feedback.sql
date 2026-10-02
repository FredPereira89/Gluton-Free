-- General feedback from the Owner and Invitees, including missing Restaurant requests and
-- reports tied to a Restaurant. Invitee rows cascade on account deletion; Owner reports remain.
create table general_feedback (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  invitee_id    uuid references invitee (user_id) on delete cascade,
  sender_role   text not null check (sender_role in ('owner', 'invitee')),
  kind          text not null check (kind in ('general', 'missing_restaurant', 'restaurant_issue')),
  page_path     text not null check (
    char_length(page_path) between 1 and 512 and page_path like '/%' and page_path not like '//%'
  ),
  message       text not null check (char_length(message) between 1 and 2048),
  restaurant_id bigint references restaurant (id),
  submitted_at  timestamptz not null default now(),
  check (
    (sender_role = 'invitee' and invitee_id is not null and invitee_id = user_id)
    or (sender_role = 'owner' and invitee_id is null)
  ),
  check (
    (kind = 'restaurant_issue' and restaurant_id is not null)
    or (kind <> 'restaurant_issue' and restaurant_id is null)
  )
);

create index general_feedback_submitted_idx on general_feedback (submitted_at desc, id desc);

-- Deny-all: only server-side API code reads or writes feedback (ADR 0006).
alter table general_feedback enable row level security;
