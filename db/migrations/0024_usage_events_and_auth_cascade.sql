-- First-party Invitee activity is deliberately minimal: event kind, action id and database time.
-- Deleting the Auth account removes the Invitee row and cascades to their feedback and events.
-- Supabase has auth.users; isolated local test databases may not. Keep the cascade wherever Auth exists.
do $$
begin
  if to_regclass('auth.users') is not null then
    execute 'delete from invitee i where not exists (select 1 from auth.users u where u.id = i.user_id)';
    execute 'alter table invitee add constraint invitee_auth_user_fk foreign key (user_id) references auth.users (id) on delete cascade';
  end if;
end
$$;

create table usage_event (
  invitee_id  uuid not null references invitee (user_id) on delete cascade,
  event_key   uuid not null,
  event_type  text not null check (event_type in ('search', 'filter', 'sort', 'report_opened', 'booking_link_clicked')),
  occurred_at timestamptz not null default now(),
  primary key (invitee_id, event_key)
);

create index usage_event_type_idx on usage_event (event_type);

-- Deny-all: usage events are only written by the authenticated first-party API (ADR 0006).
alter table usage_event enable row level security;
