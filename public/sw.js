/* Minimal app service worker: notification display and navigation, without caching private API data. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const value = event.data ? event.data.json() : {};
    payload = value && typeof value === "object" ? value : {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const title = typeof payload.title === "string" ? payload.title : "Gluton-Free";
  const body = typeof payload.body === "string" ? payload.body : "You have an update.";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
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
