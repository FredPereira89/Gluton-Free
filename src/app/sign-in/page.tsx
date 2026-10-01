import type { Metadata } from "next";

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
      <h1>Sign in</h1>
      <form className="form" action="/api/auth/sign-in" method="post">
        <label className="field">
          Email
          <input type="email" name="email" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {next && <input type="hidden" name="next" value={next} />}
        {error === "invalid_credentials" && <p className="error">Wrong email or password.</p>}
        <button className="btn" type="submit">
          Sign in
        </button>
      </form>
      <h2>Invited? Get a sign-in link</h2>
      <form className="form" action="/api/auth/magic-link" method="post">
        <label className="field">
          Email
          <input type="email" name="email" autoComplete="email" required />
        </label>
        {next && <input type="hidden" name="next" value={next} />}
        {sent === "1" && <p className="muted">If that email is on the list, a sign-in link is on its way. Open it in this browser.</p>}
        {error && LINK_ERROR_TEXT[error] && <p className="error">{LINK_ERROR_TEXT[error]}</p>}
        <button className="btn btn-secondary" type="submit">
          Email me a link
        </button>
      </form>
    </div>
  );
}
