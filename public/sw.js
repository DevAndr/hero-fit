/* Hero Fit service worker: Web Push (таймер отдыха, streak, ачивки) + тренировка без сети. */

// Версии кэшей — те же имена использует страница (components/training/offline-store.ts)
const PAGES_CACHE = "hf-pages-v1";
// v2: v1 мог хранить dev-чанки без хэша в имени — при активации удаляется
const STATIC_CACHE = "hf-static-v2";
const OFFLINE_PAGES = ["/training"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keep = [PAGES_CACHE, STATIC_CACHE];
      for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

const OFFLINE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Нет сети — Hero Fit</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0a0a0a;color:#fafafa;text-align:center;padding:16px}
a{color:#00d492;font-weight:600}p{color:#a1a1a1}</style></head><body><main><h1>Нет сети</h1>
<p>Эта страница недоступна без интернета. Тренировку можно продолжить — она сохраняется на устройстве.</p>
<p><a href="/training">Открыть тренировку</a></p></main></body></html>`;

/** Страница тренировки: сначала сеть (и обновляем копию), без сети — последняя копия. */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(request.url.split("?")[0], response.clone());
    return response;
  } catch {
    const cached = await cache.match(request.url.split("?")[0]);
    return cached ?? new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

/** Ответ можно кэшировать навсегда: хэшированная статика production-сборки (`Cache-Control: … immutable`). */
const isImmutable = (response) => response.ok && (response.headers.get("Cache-Control") ?? "").includes("immutable");

/**
 * Хэшированная статика Next неизменна — из кэша, если есть. В dev у чанков нет хэша в имени и они меняются
 * при каждой правке (Cache-Control: no-store) — такие не кэшируем, иначе браузер получал бы старый код.
 */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isImmutable(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode !== "navigate") return;

  // Выход / вход — сохранённые страницы прежнего пользователя больше не показываем
  if (url.pathname === "/login" || url.pathname.startsWith("/api/auth/signout")) {
    event.waitUntil(caches.delete(PAGES_CACHE));
    return;
  }
  if (OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(networkFirstPage(request));
    return;
  }
  // Остальные страницы — только сеть; без неё — короткая заглушка со ссылкой на тренировку
  event.respondWith(
    fetch(request).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
  );
});

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
