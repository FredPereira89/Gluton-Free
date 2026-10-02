import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice · Gluton-Free",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <article className="public-page privacy-page">
      <header className="privacy-header">
        <Link className="landing-brand" href="/">Gluton-Free</Link>
        <Link href="/sign-in">Sign in</Link>
      </header>
      <p className="eyebrow">Invitation-only beta</p>
      <h1>Privacy notice</h1>
      <p className="privacy-lede">
        This notice explains the small amount of personal information Gluton-Free keeps about Invitees,
        why it is used, and how to ask for it to be deleted.
      </p>

      <section>
        <h2>What we store and why</h2>
        <ul className="privacy-list">
          <li><strong>Your email address</strong>, to sign you in and keep your account connected to the Invite link that admitted you.</li>
          <li><strong>Invite details and account timestamps</strong>, such as which link you used, when you joined and when you last used the app, so the Owner can administer access.</li>
          <li><strong>Your feedback</strong>, including Verdict feedback and any note you choose to send, so the Owner can understand what is useful or wrong.</li>
          <li><strong>First-party usage events</strong> for searches, filters, sorting, reports opened and Booking links clicked, with a timestamp. Gluton-Free does not use third-party trackers.</li>
        </ul>
      </section>

      <section>
        <h2>How to delete your data</h2>
        <p>
          Invitees can open <Link href="/account">Your data</Link> while signed in and choose “Delete my data”. This removes the Invitee record,
          sign-in account, feedback and usage events, then signs them out. They can return only through a valid Invite link.
        </p>
      </section>

      <p className="privacy-back"><Link href="/">Back to Gluton-Free</Link></p>
    </article>
  );
}
