import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/web/brand";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<{ error?: string; next?: string; sent?: string }>;

const LINK_ERROR_TEXT: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  link_expired: "That sign-in link has expired or was already used. Request a new one.",
  not_allowed: "This email isn't allowed in. Ask for a new invite link.",
};

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, next, sent } = await searchParams;
  return (
    <div className="signin">
      <Brand />
      <h1>Sign in</h1>
      {sent === "1" ? <>
        <div className="signin-sent" role="status">
          <h2>Check your email</h2>
          <p className="muted">If that address is on the list, a sign-in link is on its way. Open the newest email, then tap Continue.</p>
        </div>
        <details className="signin-recovery">
          <summary>Use another email or resend a link</summary>
          <EmailLinkForm next={next} error={error} />
        </details>
      </> : <>
        <p className="muted">Invited? Enter your email and we&apos;ll send you a link.</p>
        <EmailLinkForm next={next} error={error} autoFocus />
      </>}
      <details className="owner-sign-in" open={error === "invalid_credentials"}>
        <summary>Owner sign in</summary>
        <form className="form" action="/api/auth/sign-in" method="post">
          <label className="field">
            Email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label className="field">
            Password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          {next && <input type="hidden" name="next" value={next} />}
          {error === "invalid_credentials" && <p className="error" role="alert">Wrong email or password.</p>}
          <button className="btn btn-secondary" type="submit">Sign in</button>
        </form>
      </details>
      <p className="small muted">Read our <Link href="/privacy">privacy notice</Link>.</p>
    </div>
  );
}

function EmailLinkForm({ next, error, autoFocus = false }: { next?: string; error?: string; autoFocus?: boolean }) {
  return <form className="form" action="/api/auth/magic-link" method="post">
    <label className="field">
      Email
      <input type="email" name="email" autoComplete="email" required autoFocus={autoFocus} />
    </label>
    {next && <input type="hidden" name="next" value={next} />}
    {error && LINK_ERROR_TEXT[error] && <p className="error" role="alert">{LINK_ERROR_TEXT[error]}</p>}
    <button className="btn" type="submit">Email me a link</button>
  </form>;
}
