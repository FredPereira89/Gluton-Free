// Where a signed-in Invitee lands. Every other page is Owner-only until pages open to Invitees (later
// tickets), so this static page is public and noindex and holds nothing private.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "You're in", robots: { index: false, follow: false } };

export default function WelcomePage() {
  return (
    <div className="signin">
      <h1>You&apos;re in</h1>
      <p className="muted">Thanks for joining the beta. You&apos;re signed in on this device and will stay signed in. We&apos;ll open more as it&apos;s ready.</p>
      <p className="muted">Signed out or on a new device? Open this site, choose &ldquo;Email me a link&rdquo; and use the same email.</p>
      <form action="/api/auth/sign-out" method="post">
        <button className="btn" type="submit">Sign out</button>
      </form>
    </div>
  );
}
