import { connection } from "next/server";
import { InstallPrompt, PushSettings } from "@/web/pwa-settings";
import { InviteesAdmin, InviteLinksAdmin } from "@/web/invite-admin";
import { listInviteLinks, listInvitees } from "@/lib/invite";
import { configuredVapidPublicKey } from "@/lib/push-config";
import Link from "next/link";

export default async function SettingsPage() {
  await connection();
  const [links, invitees] = await Promise.all([listInviteLinks(), listInvitees()]);
  return (
    <div className="settings">
      <h1>Settings</h1>
      <InstallPrompt />
      <PushSettings vapidPublicKey={configuredVapidPublicKey()} />
      <InviteLinksAdmin links={links} />
      <InviteesAdmin invitees={invitees} />
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
