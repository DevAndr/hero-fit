import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeSubscription = { endpoint: string; p256dh: string; auth: string };

/** JS-API плагина android/app/src/main/java/ru/herofit/app/push/HeroPushPlugin.kt. */
export type HeroPushPlugin = {
  /** reregister — push не расшифровался (ключи потеряны), нужна новая регистрация. */
  status(): Promise<{ distributor: boolean; permission: "granted" | "denied" | "prompt"; reregister: boolean }>;
  requestPermission(): Promise<{ permission: "granted" | "denied" }>;
  /** Ошибки: "no-distributor", "failed:<FailedReason>", "timeout". */
  register(options: { vapid: string }): Promise<NativeSubscription>;
  getSubscription(): Promise<NativeSubscription | { endpoint: null }>;
  /** Эндпоинт, снятый дистрибьютором, пока сайт не видел; читается один раз. */
  takeDropped(): Promise<{ endpoint: string | null }>;
  unregister(): Promise<void>;
  appVersion(): Promise<{ version: string; flavor: string }>;
  addListener(
    event: "subscriptionChanged",
    listener: (sub: NativeSubscription | { endpoint: null }) => void,
  ): Promise<PluginListenerHandle>;
};

export const HeroPush = registerPlugin<HeroPushPlugin>("HeroPush");

/** Страница открыта в Android-приложении (Capacitor), а не в браузере. */
export const isNativeApp = () => Capacitor.isNativePlatform();
