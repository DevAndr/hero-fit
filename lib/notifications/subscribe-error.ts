import type { NativePushReason } from "@/lib/native/push-state";

/** Разрешение на уведомления; без Notification API (WebView Android-приложения, старые браузеры) — unsupported. */
export function readNotificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

const NATIVE_ERROR: Record<Exclude<NativePushReason, null>, string> = {
  "no-distributor": "Установите приложение ntfy — подробности в настройках уведомлений",
  "foreign-server": "В ntfy выбран чужой сервер — подробности в настройках уведомлений",
  permission: "Разрешите уведомления для Hero Fit в настройках Android",
  "server-off": "Уведомления в приложении пока недоступны",
};

/** Почему не удалось включить push: в приложении — причина из ntfy, в браузере — самые частые причины. */
export function subscribeErrorText(o: { native: boolean; nativeReason: NativePushReason; permission: NotificationPermission | "unsupported" }): string {
  if (o.native) return o.nativeReason ? NATIVE_ERROR[o.nativeReason] : "Не удалось включить push";
  return o.permission === "denied"
    ? "Разрешение на уведомления не выдано — включите его в настройках сайта"
    : "Не удалось включить push. В режиме инкогнито браузеры его не поддерживают.";
}
