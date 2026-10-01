// Request and response shapes for Invite link and Invitee administration (owner-only routes).
import { z } from "zod";

export const inviteLinkSchema = z.strictObject({
  id: z.number().int().positive().safe(),
  token: z.string(),
  label: z.string(),
  useCap: z.number().int().positive().nullable(),
  useCount: z.number().int().nonnegative(),
  revoked: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const createInviteLinkBodySchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  useCap: z.number().int().min(1).max(100_000).nullable().optional(),
});
export const inviteLinkListResponseSchema = z.strictObject({ items: z.array(inviteLinkSchema) });
export const revokeInviteLinkResponseSchema = z.strictObject({ revoked: z.literal(true) });

export const inviteeSchema = z.strictObject({
  userId: z.uuid(),
  email: z.string().nullable(),
  inviteLink: z.strictObject({ id: z.number().int().positive().safe(), label: z.string() }).nullable(),
  joinedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime().nullable(),
  lockedOut: z.boolean(),
});
export const inviteeListResponseSchema = z.strictObject({ items: z.array(inviteeSchema) });
export const setInviteeLockOutBodySchema = z.strictObject({ lockedOut: z.boolean() });
