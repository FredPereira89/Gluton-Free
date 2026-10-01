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
          <li><strong>First-party usage events</strong>, with minimal details and a timestamp, to understand which app features are used. Gluton-Free does not use third-party trackers.</li>
        </ul>
      </section>

      <section>
        <h2>How to delete your data</h2>
        <p>
          Ask the Owner to delete your account through the person or private channel that shared your Invite link.
          Include the email address you used to join. Deletion removes your Invitee record, sign-in account,
          feedback and usage events. An in-app “Delete my data” control is planned and is not available yet.
        </p>
      </section>

      <p className="privacy-back"><Link href="/">Back to Gluton-Free</Link></p>
    </article>
  );
}
