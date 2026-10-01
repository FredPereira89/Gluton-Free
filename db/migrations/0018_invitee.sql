-- An Invitee is a signed-in person the Owner has let into the beta (ADR 0008). user_id is the
-- Supabase Auth user id (the JWT sub). A locked-out Invitee is refused like a stranger.
create table invitee (
  user_id     uuid primary key,
  locked_out  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Deny-all: no policies, so the Data API exposes nothing (ADR 0006).
alter table invitee enable row level security;
