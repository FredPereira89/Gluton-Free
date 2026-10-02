import { USAGE_EVENT_TYPES, type UsageEventType } from "./api-contract";
import { db } from "./db";

/** Stores no search terms, filters, restaurant ids, device details or network metadata. */
export async function recordUsageEvent(inviteeId: string, eventKey: string, type: UsageEventType): Promise<void> {
  await db()`
    insert into usage_event (invitee_id, event_key, event_type)
    values (${inviteeId}, ${eventKey}, ${type})
    on conflict (invitee_id, event_key) do nothing
  `;
}

export async function listUsageEventCounts(): Promise<{ type: UsageEventType; count: number }[]> {
  const rows = await db()<{ event_type: UsageEventType; count: string }[]>`
    select event_type, count(*) as count from usage_event group by event_type
  `;
  const counts = new Map(rows.map((row) => [row.event_type, Number(row.count)]));
  return USAGE_EVENT_TYPES.map((type) => ({ type, count: counts.get(type) ?? 0 }));
}
