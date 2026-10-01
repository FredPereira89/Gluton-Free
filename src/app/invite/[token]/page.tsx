// Public Invite link landing page: a live link asks for an email and sends a magic link; a dead one
// (revoked, exhausted, unknown or malformed) says so and creates nothing.
import type { Metadata } from "next";
import { connection } from "next/server";
import { inviteLinkIsOpen } from "@/lib/invite";

export const metadata: Metadata = { title: "Join the beta", robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
};

const ERROR_TEXT: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  send_failed: "We couldn't send the link. Try again in a minute.",
};

export default async function InvitePage({ params, searchParams }: Props) {
  await connection();
  const { token } = await params;
  const { sent, error } = await searchParams;

  if (!(await inviteLinkIsOpen(token))) {
    return (
      <div className="signin">
        <h1>This link no longer works</h1>
        <p className="muted">It was revoked or has reached its limit. Ask whoever shared it for a new one.</p>
      </div>
    );
  }
  if (sent === "1") {
    return (
      <div className="signin">
        <h1>Check your email</h1>
        <p className="muted">We sent you a link. Open it on any device and tap Continue to finish joining.</p>
      </div>
    );
  }
  return (
    <div className="signin">
      <h1>Join the beta</h1>
      <p className="muted">Enter your email and we&apos;ll send you a link to sign in. You stay signed in on this device.</p>
      <form className="form" action="/api/auth/invite" method="post">
        <label className="field">
          Email
          <input type="email" name="email" autoComplete="email" required autoFocus />
        </label>
        <input type="hidden" name="token" value={token} />
        {error && ERROR_TEXT[error] && <p className="error">{ERROR_TEXT[error]}</p>}
        <button className="btn" type="submit">
          Send me a link
        </button>
      </form>
    </div>
  );
}
