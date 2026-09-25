"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "unsupported" | "off" | "enabled" | "denied" | "error";
type BeforeInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SUBSCRIPTION_ID_KEY = "gluton-free.push-subscription-id";

function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
  return new Uint8Array(bytes);
}

function subscriptionPayload(subscription: PushSubscription) {
  const value = subscription.toJSON();
  if (!subscription.endpoint || !value.keys?.p256dh || !value.keys.auth) {
    throw new Error("This browser returned an incomplete push subscription.");
  }
  return { type: "web" as const, endpoint: subscription.endpoint, keys: value.keys };
}

async function saveSubscription(subscription: PushSubscription): Promise<number> {
  const response = await fetch("/api/v1/push-subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscriptionPayload(subscription)),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof value === "object" && value !== null && "detail" in value && typeof value.detail === "string"
      ? value.detail
      : "Could not save this device's push subscription.";
    throw new Error(detail);
  }
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "number" || !Number.isSafeInteger(value.id)) {
    throw new Error("The server returned an invalid push subscription.");
  }
  try { window.localStorage.setItem(SUBSCRIPTION_ID_KEY, String(value.id)); } catch { /* The in-memory id still supports this session. */ }
  return value.id;
}

async function deleteSubscription(id: number): Promise<void> {
  const response = await fetch(`/api/v1/push-subscriptions/${id}`, { method: "DELETE" });
  if (response.status === 404) return;
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const detail = typeof value === "object" && value !== null && "detail" in value && typeof value.detail === "string"
      ? value.detail
      : "Could not remove this device's push subscription.";
    throw new Error(detail);
  }
}

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  }, []);
  return null;
}

export function InstallPrompt() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPrompt | null>(null);

  useEffect(() => {
    setStandalone(isInstalled());
    setIos(isIosDevice());
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPrompt);
    };
    const installed = () => {
      setStandalone(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setStandalone(true);
    setPromptEvent(null);
  }

  return (
    <section className="settings-section" aria-labelledby="install-heading">
      <h2 id="install-heading">Install the app</h2>
      {standalone ? <p role="status">Gluton-Free is installed on this device.</p> : ios ? (
        <p>On iPhone or iPad, open the Share menu in Safari and choose <strong>Add to Home Screen</strong>.</p>
      ) : promptEvent ? (
        <>
          <p>Add Gluton-Free to this device's Home Screen for a standalone app experience.</p>
          <button className="btn" type="button" onClick={() => void install()}>Add to Home Screen</button>
        </>
      ) : (
        <p>Use your browser's install option or menu to add Gluton-Free to your Home Screen.</p>
      )}
    </section>
  );
}

export function PushSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<PushState>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function inspectDevice() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      setIosNeedsInstall(isIosDevice() && !isInstalled());
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const current = await registration.pushManager.getSubscription();
        if (cancelled) return;
        let savedId = NaN;
        try { savedId = Number(window.localStorage.getItem(SUBSCRIPTION_ID_KEY)); } catch { /* Storage can be disabled by the browser. */ }
        if (Number.isSafeInteger(savedId) && savedId > 0) setSubscriptionId(savedId);
        if (current) {
          setSubscription(current);
          setState("enabled");
          if (vapidPublicKey) {
            try {
              const id = await saveSubscription(current);
              if (!cancelled) setSubscriptionId(id);
            } catch (error) {
              if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not sync this device's subscription.");
            }
          }
        } else {
          setState(Notification.permission === "denied" ? "denied" : "off");
        }
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Could not check this device's push subscription.");
      }
    }
    void inspectDevice();
    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  async function enable() {
    setBusy(true);
    setMessage("");
    let created: PushSubscription | null = null;
    try {
      if (!vapidPublicKey) throw new Error("Push notifications are not configured on this server.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      created = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey),
      });
      const id = await saveSubscription(created);
      setSubscription(created);
      setSubscriptionId(id);
      setState("enabled");
    } catch (error) {
      if (created && !subscription) await created.unsubscribe().catch(() => false);
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      if (subscriptionId !== null) await deleteSubscription(subscriptionId);
      await subscription?.unsubscribe();
      try { window.localStorage.removeItem(SUBSCRIPTION_ID_KEY); } catch { /* The device subscription has still been removed. */ }
      setSubscription(null);
      setSubscriptionId(null);
      setState("off");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  const status = state === "checking" ? "Checking this device…"
    : state === "unsupported" ? "Push notifications are not supported by this browser."
      : state === "enabled" ? "Push notifications are enabled on this device."
        : state === "denied" ? "Notifications are blocked. Allow them in your browser or device settings to enable push."
          : state === "error" ? message || "Push notification status could not be checked."
            : "Push notifications are off on this device.";

  return (
    <section className="settings-section" aria-labelledby="push-heading">
      <h2 id="push-heading">Push notifications</h2>
      <p role="status" aria-live="polite">{status}</p>
      {iosNeedsInstall && <p>On iPhone or iPad, add the app to your Home Screen before enabling push notifications.</p>}
      {message && state !== "error" && <p className="error" role="alert">{message}</p>}
      {!vapidPublicKey && state !== "enabled" && <p>Push notifications are not configured on this server yet.</p>}
      {state === "enabled" ? (
        <button className="btn btn-secondary" type="button" onClick={() => void disable()} disabled={busy}>
          {busy ? "Disabling…" : "Turn off on this device"}
        </button>
      ) : state !== "unsupported" && state !== "checking" ? (
        <button className="btn" type="button" onClick={() => void enable()} disabled={busy || !vapidPublicKey || iosNeedsInstall || state === "denied"}>
          {busy ? "Enabling…" : "Enable push notifications"}
        </button>
      ) : null}
    </section>
  );
}
