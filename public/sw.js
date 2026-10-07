/* Hero Fit service worker: Web Push (таймер отдыха, streak, ачивки). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function visibleClient() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.find((c) => c.visibilityState === "visible" && c.focused);
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Hero Fit", body: event.data.text() };
  }

  event.waitUntil(
    (async () => {
      // Приложение открыто и на экране: таймер отдыха уже пропищал на странице — не дублируем.
      if (data.type === "REST") {
        const client = await visibleClient();
        if (client) {
          client.postMessage({ type: "push", payload: data });
          return;
        }
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        renotify: true,
        icon: "/pwa-icon/192",
        badge: "/pwa-icon/96",
        vibrate: data.type === "REST" ? [300, 150, 300] : [100, 50, 100],
        data: { url: data.url || "/dashboard" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
