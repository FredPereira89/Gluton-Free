// Where a signed-in Invitee lands. Every other page is Owner-only until pages open to Invitees (later
// tickets), so this static page is public and noindex and holds nothing private.
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/web/brand";

export const metadata: Metadata = { title: "You're in", robots: { index: false, follow: false } };

export default function WelcomePage() {
  return (
    <div className="signin">
      <Brand />
      <h1>You&apos;re in</h1>
      <p className="muted">You&apos;re signed in. Browse Restaurant Verdicts in the Lisbon Directory.</p>
      <p><Link className="btn" href="/">Browse Restaurant Verdicts</Link></p>
      <p className="muted">Signed out or on a new device? Open this site, choose &ldquo;Email me a link&rdquo; and use the same email.</p>
      <form className="plain" action="/api/auth/sign-out" method="post">
        <button className="btn btn-secondary" type="submit">Sign out</button>
      </form>
    </div>
  );
}
