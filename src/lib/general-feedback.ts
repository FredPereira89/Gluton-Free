import type { Caller } from "./auth";
import type { GeneralFeedbackSubmission } from "./api-contract";
import { db } from "./db";

export async function saveGeneralFeedback(
  userId: string,
  role: Caller["role"],
  input: GeneralFeedbackSubmission,
): Promise<boolean> {
  const inviteeId = role === "invitee" ? userId : null;
  const sql = db();

  if (input.kind === "restaurant_issue") {
    const rows = await sql<{ id: string }[]>`
      insert into general_feedback (user_id, invitee_id, sender_role, kind, page_path, message, restaurant_id)
      select ${userId}, ${inviteeId}, ${role}, ${input.kind}, ${input.pagePath}, ${input.message}, r.id
      from restaurant r
      where r.slug = ${input.restaurantSlug}
      returning id
    `;
    return rows.length > 0;
  }

  await sql`
    insert into general_feedback (user_id, invitee_id, sender_role, kind, page_path, message)
    values (${userId}, ${inviteeId}, ${role}, ${input.kind}, ${input.pagePath}, ${input.message})
  `;
  return true;
}

export type GeneralFeedbackInboxItem = {
  id: string;
  userId: string;
  senderRole: Caller["role"];
  email: string | null;
  kind: GeneralFeedbackSubmission["kind"];
  pagePath: string;
  message: string;
  restaurantSlug: string | null;
  restaurantName: string | null;
  submittedAt: string;
};

type GeneralFeedbackInboxRow = {
  id: string;
  user_id: string;
  sender_role: Caller["role"];
  email: string | null;
  kind: GeneralFeedbackSubmission["kind"];
  page_path: string;
  message: string;
  restaurant_slug: string | null;
  restaurant_name: string | null;
  submitted_at: Date;
};

/** Newest general feedback first, for the Owner's combined feedback inbox. */
export async function listGeneralFeedbackInbox(): Promise<GeneralFeedbackInboxItem[]> {
  const rows = await db()<GeneralFeedbackInboxRow[]>`
    select f.id, f.user_id, f.sender_role, i.email, f.kind, f.page_path, f.message,
           r.slug as restaurant_slug, r.name as restaurant_name, f.submitted_at
    from general_feedback f
    left join invitee i on i.user_id = f.user_id
    left join restaurant r on r.id = f.restaurant_id
    order by f.submitted_at desc, f.id desc
  `;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    senderRole: row.sender_role,
    email: row.email,
    kind: row.kind,
    pagePath: row.page_path,
    message: row.message,
    restaurantSlug: row.restaurant_slug,
    restaurantName: row.restaurant_name,
    submittedAt: row.submitted_at.toISOString(),
  }));
}
