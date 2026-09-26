/* Minimal app service worker: notification display and navigation, without caching private API data. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const NOTIFICATION_BODY = {
  verdict_ready: "The Verdict is ready.",
  lookup_failed: "The Lookup failed.",
  owner_question: "An Owner question is waiting.",
};

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const value = event.data ? event.data.json() : {};
    payload = value && typeof value === "object" ? value : {};
  } catch {
    payload = {};
  }
  const body = NOTIFICATION_BODY[payload.kind] ?? "You have an update.";
  const url = typeof payload.restaurantSlug === "string" ? `/r/${payload.restaurantSlug}` : "/";
  event.waitUntil(self.registration.showNotification("Gluton-Free", {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url ?? "/", self.location.origin);
  const url = requestedUrl.origin === self.location.origin ? requestedUrl.href : `${self.location.origin}/`;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const client = windows.find((candidate) => candidate.url.startsWith(self.location.origin));
    if (client) return client.navigate(url).then((navigated) => navigated?.focus());
    return self.clients.openWindow(url);
  }));
});
