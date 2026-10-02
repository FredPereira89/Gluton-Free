import { connection } from "next/server";
import { InstallPrompt, PushSettings } from "@/web/pwa-settings";
import { InviteesAdmin, InviteLinksAdmin } from "@/web/invite-admin";
import { listInviteLinks, listInvitees } from "@/lib/invite";
import { configuredVapidPublicKey } from "@/lib/push-config";
import { listUsageEventCounts } from "@/lib/usage-events";
import Link from "next/link";

const USAGE_EVENT_LABELS = {
  search: "Searches",
  filter: "Filters",
  sort: "Sorts",
  report_opened: "Reports opened",
  booking_link_clicked: "Booking links clicked",
} as const;

export default async function SettingsPage() {
  await connection();
  const [links, invitees, usageCounts] = await Promise.all([listInviteLinks(), listInvitees(), listUsageEventCounts()]);
  return (
    <div className="settings">
      <h1>Settings</h1>
      <section className="settings-group" aria-labelledby="device-settings-title">
        <h2 id="device-settings-title">Device</h2>
        <InstallPrompt />
        <PushSettings vapidPublicKey={configuredVapidPublicKey()} />
      </section>
      <section className="settings-group" aria-labelledby="beta-access-title">
        <h2 id="beta-access-title">Beta access</h2>
        <InviteLinksAdmin links={links} />
        <InviteesAdmin invitees={invitees} />
      </section>
      <section className="settings-group" aria-labelledby="owner-operations-title">
        <h2 id="owner-operations-title">Owner operations</h2>
        <section className="usage-event-counts" aria-labelledby="usage-event-counts-title">
          <h3 id="usage-event-counts-title">Invitee usage</h3>
          <ul>{usageCounts.map(({ type, count }) => <li key={type}><span>{USAGE_EVENT_LABELS[type]}</span><strong>{count}</strong></li>)}</ul>
        </section>
        <nav className="settings-links" aria-label="Owner tools">
          <Link className="btn btn-secondary" href="/restaurants">Restaurant inventory</Link>
          <Link className="btn btn-secondary" href="/feedback">Feedback inbox</Link>
          <Link className="btn btn-secondary" href="/baseline-checks">Baseline spot checks</Link>
        </nav>
      </section>
      <form action="/api/auth/sign-out" method="post">
        <button className="btn btn-secondary" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
