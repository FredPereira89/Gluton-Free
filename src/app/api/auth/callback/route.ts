import { createAuthRouteClient, isActiveInvitee, type CookieToSet } from "@/lib/auth";
import { redirectWithCookies, safeNext } from "@/lib/auth-flow";
import { inviteLinkIsOpen, joinWithInvite } from "@/lib/invite";

// Public: where a magic link lands. Exchanges the code for a session, then lets in only the Owner or
// an Invitee. With an Invite link's token, a new person is recorded as an Invitee tied to that
// link; without one, only an existing Invitee gets in. Anyone else is signed straight back out.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const invite = url.searchParams.get("invite");
  const next = safeNext(url.searchParams.get("next") ?? "/");
  const cookies: CookieToSet[] = [];
  const go = (path: string) => redirectWithCookies(request, path, cookies);

  if (!code) return go("/sign-in?error=link_expired");
  const supabase = createAuthRouteClient(request, (set) => cookies.push(...set));
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data.user;
  if (error || !user) return go("/sign-in?error=link_expired");

  if (user.id === process.env.OWNER_USER_ID) return go(next);

  const admitted = invite
    ? user.email !== undefined && (await joinWithInvite({ userId: user.id, email: user.email, token: invite })) !== "refused"
    : await isActiveInvitee(user.id);
  if (admitted) return go(invite ? "/" : next);

  await supabase.auth.signOut();
  // A dead link gets its own page; a live one that still refused means this person is locked out.
  if (invite && !(await inviteLinkIsOpen(invite))) return go(`/invite/${encodeURIComponent(invite)}`);
  return go("/sign-in?error=not_allowed");
}
