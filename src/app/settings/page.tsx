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
      <InstallPrompt />
      <PushSettings vapidPublicKey={configuredVapidPublicKey()} />
      <InviteLinksAdmin links={links} />
      <InviteesAdmin invitees={invitees} />
      <section className="usage-event-counts" aria-labelledby="usage-event-counts-title">
        <h2 id="usage-event-counts-title">Invitee usage</h2>
        <ul>{usageCounts.map(({ type, count }) => <li key={type}>{USAGE_EVENT_LABELS[type]}: {count}</li>)}</ul>
      </section>
      <Link href="/feedback">Feedback inbox</Link>
      <Link href="/baseline-checks">Baseline spot checks</Link>
      <form action="/api/auth/sign-out" method="post">
        <button className="btn" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
