// Public landing for the emailed sign-in link. Opening it changes nothing (mail scanners and link
// previews open links); the button posts the one-time token to /api/auth/confirm to start the session.
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ token_hash?: string; code?: string; invite?: string; next?: string }> };

export default async function ConfirmPage({ searchParams }: Props) {
  await connection();
  const { token_hash: tokenHash, code, invite, next } = await searchParams;

  if (!tokenHash && !code) {
    return (
      <div className="signin">
        <h1>This link is incomplete</h1>
        <p className="muted">Request a new sign-in link and open it from the newest email.</p>
        <a className="btn" href="/sign-in">Back to sign in</a>
      </div>
    );
  }
  return (
    <div className="signin">
      <h1>Finish signing in</h1>
      <p className="muted">One tap and you&apos;re in. You stay signed in on this device.</p>
      <form className="form" action="/api/auth/confirm" method="post">
        {tokenHash && <input type="hidden" name="token_hash" value={tokenHash} />}
        {code && <input type="hidden" name="code" value={code} />}
        {invite && <input type="hidden" name="invite" value={invite} />}
        {next && <input type="hidden" name="next" value={next} />}
        <button className="btn" type="submit">Continue</button>
      </form>
    </div>
  );
}
