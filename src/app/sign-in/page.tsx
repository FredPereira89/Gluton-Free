type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, next } = await searchParams;
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
    </div>
  );
}
