-- First-party Invitee activity is deliberately minimal: event kind, action id and database time.
-- Deleting the Auth account removes the Invitee row and cascades to their feedback and events.
delete from invitee i
where not exists (select 1 from auth.users u where u.id = i.user_id);

alter table invitee
  add constraint invitee_auth_user_fk
  foreign key (user_id) references auth.users (id) on delete cascade;

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
