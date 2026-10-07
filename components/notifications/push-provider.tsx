"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { subscribePushAction, unsubscribePushAction } from "@/lib/notifications/actions";

type PushApi = {
  /** Браузер умеет Web Push (на iOS — только у приложения, добавленного на экран «Домой»). */
  supported: boolean;
  /** Сервер настроен (есть VAPID-ключ). */
  available: boolean;
  ready: boolean;
  subscribed: boolean;
  permission: NotificationPermission | "unsupported";
  busy: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
  /** Отвязать устройство от аккаунта на сервере (при выходе), не трогая браузерную подписку. */
  forgetDevice: () => Promise<void>;
};

const PushContext = createContext<PushApi | null>(null);

export const usePush = () => useContext(PushContext);

const noopSubscribe = () => () => {};
const isSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const readPermission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

function base64UrlToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushProvider({ vapidKey, children }: { vapidKey: string | null; children: ReactNode }) {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, () => false);
  const browserPermission = useSyncExternalStore(noopSubscribe, readPermission, () => "default" as const);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setSubscription(sub);
        // Подписка браузера жива — убеждаемся, что сервер знает её для текущего пользователя.
        if (sub) void subscribePushAction(sub.toJSON());
      })
      .catch((e) => console.warn("[push] service worker", e))
      .finally(() => setReady(true));
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || !vapidKey) return false;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return false;
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(vapidKey) }));
      const { ok } = await subscribePushAction(sub.toJSON());
      if (ok) setSubscription(sub);
      return ok;
    } catch (e) {
      console.warn("[push] subscribe failed", e);
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, vapidKey]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    setBusy(true);
    try {
      await unsubscribePushAction(subscription.endpoint);
      await subscription.unsubscribe();
      setSubscription(null);
    } finally {
      setBusy(false);
    }
  }, [subscription]);

  const forgetDevice = useCallback(async () => {
    if (subscription) await unsubscribePushAction(subscription.endpoint).catch(() => {});
  }, [subscription]);

  const api = useMemo<PushApi>(
    () => ({
      supported,
      available: Boolean(vapidKey),
      ready,
      subscribed: Boolean(subscription),
      permission: permission ?? browserPermission,
      busy,
      subscribe,
      unsubscribe,
      forgetDevice,
    }),
    [supported, vapidKey, ready, subscription, permission, browserPermission, busy, subscribe, unsubscribe, forgetDevice],
  );

  return <PushContext.Provider value={api}>{children}</PushContext.Provider>;
}
