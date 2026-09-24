export default function SettingsPage() {
  return (
    <div className="settings">
      <h1>Settings</h1>
      <form action="/api/auth/sign-out" method="post">
        <button className="btn" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
