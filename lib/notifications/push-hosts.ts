import { isIP } from "node:net";
import { z } from "zod";
import { PushKind } from "@/generated/prisma/enums";

export const subscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
  kind: z.enum(PushKind).default("WEB"),
  appVersion: z.string().max(32).optional(),
});

/** Подписка Android-приложения (UnifiedPush или своё соединение) — только через наш ntfy. */
export function isNativeKind(kind: PushKind) {
  return kind !== "WEB";
}

/** Имя хоста NTFY_URL в нижнем регистре; null — ntfy не настроен. */
export function ntfyHost(ntfyUrl: string | undefined): string | null {
  if (!ntfyUrl) return null;
  try {
    return new URL(ntfyUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Куда сервер согласен слать push. Веб — любой https-хост, кроме localhost и IP: у браузеров свои push-сервисы
 * (у Яндекс Браузера тоже), список хостов молча отрезал бы им уведомления. Нативные — только хост NTFY_URL; порт не
 * сравнивается (в e2e фейковый ntfy слушает случайный порт).
 */
export function allowedPushHost(kind: PushKind, endpoint: string, ntfyUrl: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (isNativeKind(kind)) {
    const ntfy = ntfyHost(ntfyUrl);
    return ntfy !== null && host === ntfy;
  }
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  return isIP(host.replace(/^\[|\]$/g, "")) === 0;
}

/** Принимает ли сервер подписку: хост (allowedPushHost) и, для нативных, флаг native_app у пользователя. */
export function subscriptionAllowed(kind: PushKind, endpoint: string, ntfyUrl: string | undefined, nativeEnabled: boolean): boolean {
  if (!allowedPushHost(kind, endpoint, ntfyUrl)) return false;
  return !isNativeKind(kind) || nativeEnabled;
}
