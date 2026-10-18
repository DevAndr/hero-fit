"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { dismissAlertAction } from "@/lib/alerts/actions";
import { nextChange, nextPopup, visibleBanners, type AlertView } from "@/lib/alerts/rules";
import { AlertBanner } from "./alert-banner";
import { AlertPopup } from "./alert-popup";
import { readSessionHidden, sessionStore, writeSessionHidden } from "./hidden-store";

/** Предел setTimeout (~24,8 сут); дальше — перепроверим позже. */
const MAX_DELAY = 2 ** 31 - 1;

const noopSubscribe = () => () => {};

/**
 * Системные оповещения кабинета (спека 2026-10-18-system-alerts-design): строки над шапкой и попап по одному.
 * Показ — только после гидрации: «закрытые до следующего захода» живут в sessionStorage, а «сейчас» у сервера другое.
 */
export function SystemAlerts({ alerts }: { alerts: AlertView[] }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [now, setNow] = useState(() => new Date());
  // На сервере хранилища нет — пустой набор; до гидрации всё равно ничего не рисуем
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readSessionHidden(sessionStore()));

  // Начало и конец показа — по таймеру, без перезагрузки
  useEffect(() => {
    const at = nextChange(alerts, now);
    if (!at) return;
    const t = setTimeout(() => setNow(new Date()), Math.min(MAX_DELAY, at.getTime() - Date.now() + 50));
    return () => clearTimeout(t);
  }, [alerts, now]);

  if (!mounted) return null;

  const dismiss = (a: AlertView) => {
    const next = new Set(hidden).add(a.id);
    setHidden(next);
    if (a.dismiss === "SESSION") writeSessionHidden(sessionStore(), next);
    if (a.dismiss === "FOREVER") dismissAlertAction(a.id).catch(() => {});
  };

  const banners = visibleBanners(alerts, now, hidden);
  const popup = nextPopup(alerts, now, hidden);

  return (
    <>
      {banners.map((a) => (
        <AlertBanner key={a.id} alert={a} onDismiss={() => dismiss(a)} />
      ))}
      {popup ? <AlertPopup key={popup.id} alert={popup} open onDismiss={() => dismiss(popup)} /> : null}
    </>
  );
}
