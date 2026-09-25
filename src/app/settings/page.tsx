import { InstallPrompt, PushSettings } from "@/web/pwa-settings";
import { configuredVapidPublicKey } from "@/lib/push-config";

export default function SettingsPage() {
  return (
    <div className="settings">
      <h1>Settings</h1>
      <InstallPrompt />
      <PushSettings vapidPublicKey={configuredVapidPublicKey()} />
      <form action="/api/auth/sign-out" method="post">
        <button className="btn" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
