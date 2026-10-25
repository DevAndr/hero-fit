"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribePushAction, unsubscribePushAction } from "@/lib/notifications/actions";
import { HeroPush, type NativeSubscription } from "@/lib/native/hero-push";
import { nativePushReason, type NativePushReason } from "@/lib/native/push-state";

type Status = { distributor: boolean; permission: "granted" | "denied" | "prompt" };

export type NativePush = {
  ready: boolean;
  subscribed: boolean;
  busy: boolean;
  permission: NotificationPermission;
  reason: NativePushReason;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
  forgetDevice: () => Promise<void>;
};

/**
 * Push в Android-приложении: подписку даёт плагин HeroPush (UnifiedPush через приложение ntfy), сервер хранит её как
 * Web Push с kind UNIFIEDPUSH (спека 2026-10-25-native-push-ntfy). enabled = false — хук ничего не делает (браузер).
 */
export function useNativePush(enabled: boolean, vapidKey: string | null, ntfyUrl: string | null): NativePush {
  const host = useMemo(() => {
    try {
      return ntfyUrl ? new URL(ntfyUrl).hostname.toLowerCase() : null;
    } catch {
      return null;
    }
  }, [ntfyUrl]);
  const [status, setStatus] = useState<Status>({ distributor: true, permission: "prompt" });
  // endpoint — что выдал дистрибьютор (для подсказки «чужой сервер»), saved — что принял сервер
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const version = useRef<string | undefined>(undefined);
  const current = useRef<string | null>(null);

  const save = useCallback(async (sub: NativeSubscription) => {
    setEndpoint(sub.endpoint);
    current.current = sub.endpoint;
    const { ok } = await subscribePushAction({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
      kind: "UNIFIEDPUSH",
      appVersion: version.current,
    }).catch(() => ({ ok: false }));
    setSaved(ok);
    return ok;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      // Дистрибьютор снял регистрацию, пока сайт не видел (удалили ntfy, сменили сервер) — убрать подписку на сервере
      const dropped = (await HeroPush.takeDropped()).endpoint;
      if (dropped) await unsubscribePushAction(dropped).catch(() => {});
      const [st, sub, info] = await Promise.all([HeroPush.status(), HeroPush.getSubscription(), HeroPush.appVersion()]);
      if (cancelled) return;
      version.current = info.version;
      setStatus({ distributor: st.distributor, permission: st.permission });
      if (sub.endpoint && !st.distributor) {
        // Приложение ntfy удалили — подписка мертва: убрать на сервере и на телефоне, а не пересохранять
        await unsubscribePushAction(sub.endpoint).catch(() => {});
        await HeroPush.unregister().catch(() => {});
        return;
      }
      if (st.reregister && st.distributor && st.permission === "granted" && vapidKey) {
        // Push не расшифровался — новая регистрация (новые ключи и, возможно, эндпоинт)
        const fresh = await HeroPush.register({ vapid: vapidKey }).catch(() => null);
        if (fresh) {
          if (sub.endpoint && sub.endpoint !== fresh.endpoint) await unsubscribePushAction(sub.endpoint).catch(() => {});
          await save(fresh);
          return;
        }
      }
      if (sub.endpoint) await save(sub);
    })()
      .catch((e) => console.warn("[push] native init", e))
      .finally(() => !cancelled && setReady(true));
    const listener = HeroPush.addListener("subscriptionChanged", (sub) => {
      if (sub.endpoint) void save(sub);
      else {
        if (current.current) void unsubscribePushAction(current.current).catch(() => {});
        current.current = null;
        setEndpoint(null);
        setSaved(false);
      }
    });
    return () => {
      cancelled = true;
      void listener.then((l) => l.remove());
    };
  }, [enabled, vapidKey, save]);

  const subscribe = useCallback(async () => {
    if (!enabled || !vapidKey) return false;
    setBusy(true);
    try {
      const { permission } = await HeroPush.requestPermission();
      setStatus((s) => ({ ...s, permission }));
      if (permission !== "granted") return false;
      const sub = await HeroPush.register({ vapid: vapidKey }).catch((e: Error) => {
        if (e.message === "no-distributor") setStatus((s) => ({ ...s, distributor: false }));
        else console.warn("[push] native register", e.message);
        return null;
      });
      if (!sub) return false;
      setStatus((s) => ({ ...s, distributor: true }));
      // Чужой сервер ntfy сервер всё равно не примет — показываем подсказку и снимаем регистрацию: после смены сервера
      // в ntfy следующее «Включить» получит адрес на новом сервере, а не прежний
      if (nativePushReason({ distributor: true, permission, endpoint: sub.endpoint, ntfyHost: host }) === "foreign-server") {
        await HeroPush.unregister().catch(() => {});
        setEndpoint(sub.endpoint);
        current.current = null;
        setSaved(false);
        return false;
      }
      return await save(sub);
    } finally {
      setBusy(false);
    }
  }, [enabled, vapidKey, host, save]);

  const forgetDevice = useCallback(async () => {
    if (!enabled) return;
    if (current.current) await unsubscribePushAction(current.current).catch(() => {});
    await HeroPush.unregister().catch(() => {});
    current.current = null;
    setEndpoint(null);
    setSaved(false);
  }, [enabled]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      await forgetDevice();
    } finally {
      setBusy(false);
    }
  }, [forgetDevice]);

  return {
    ready,
    subscribed: saved,
    busy,
    permission: status.permission === "prompt" ? "default" : status.permission,
    reason: enabled ? nativePushReason({ ...status, endpoint, ntfyHost: host }) : null,
    subscribe,
    unsubscribe,
    forgetDevice,
  };
}
