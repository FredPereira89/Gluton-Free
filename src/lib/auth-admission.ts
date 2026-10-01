import { isActiveInvitee } from "./auth";
import { inviteLinkIsOpen, joinWithInvite } from "./invite";

type SignedIn = { id: string; email?: string | undefined };
type Session = { auth: { signOut: () => Promise<unknown> } };

/**
 * Decides where a person who just proved their email goes: the Owner straight through; an Invitee
 * through the Invite link they redeemed (recorded now) or, without one, only if already recorded.
 * Anyone else is signed straight back out. Returns the path to redirect to.
 */
export async function admitSignedIn(supabase: Session, user: SignedIn, invite: string | null, next: string): Promise<string> {
  if (user.id === process.env.OWNER_USER_ID) return next;

  const admitted = invite
    ? user.email !== undefined && (await joinWithInvite({ userId: user.id, email: user.email, token: invite })) !== "refused"
    : await isActiveInvitee(user.id);
  if (admitted) return invite ? "/" : next;

  await supabase.auth.signOut();
  // A dead link gets its own page; a live one that still refused means this person is locked out.
  if (invite && !(await inviteLinkIsOpen(invite))) return `/invite/${encodeURIComponent(invite)}`;
  return "/sign-in?error=not_allowed";
}
