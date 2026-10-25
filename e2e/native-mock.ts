import type { Page } from "@playwright/test";

export type NativeMockOptions = {
  /** Есть ли на «телефоне» дистрибьютор UnifiedPush (приложение ntfy). */
  distributor?: boolean;
  permission?: "granted" | "denied";
  /** Что вернёт HeroPush.register — эндпоинт «ntfy» и ключи Web Push. */
  register: { endpoint: string; p256dh: string; auth: string };
  /** Подписка, уже сохранённая в приложении (getSubscription). */
  saved?: { endpoint: string; p256dh: string; auth: string } | null;
  /** Эндпоинт, снятый дистрибьютором до запуска (takeDropped). */
  dropped?: string | null;
  /** Push не расшифровался — приложение должно перерегистрироваться (status().reregister). */
  reregister?: boolean;
};

/**
 * Страница как в Android-приложении: Capacitor берёт платформу из CapacitorCustomPlatform, а вызовы нативных
 * плагинов (HeroPush, App) — из window.Capacitor.nativePromise/nativeCallback, если в PluginHeaders есть их методы.
 * Тестового кода в продакшене нет. Состояние фейка — window.__heroPush и sessionStorage (unregisterCalls и т.п.).
 */
export async function mockNativeApp(page: Page, opts: NativeMockOptions) {
  await page.addInitScript((o: NativeMockOptions) => {
    // Состояние «телефона» переживает перезагрузки (выход из аккаунта — полная навигация): как SharedPreferences
    const KEY = "__heroPush";
    const initial = {
      distributor: o.distributor ?? true,
      permission: (o.permission ?? "prompt") as string,
      saved: o.saved ?? null,
      dropped: o.dropped ?? null,
      reregister: o.reregister ?? false,
      unregisterCalls: 0,
      registerCalls: 0,
    };
    const stored = sessionStorage.getItem(KEY);
    const state: typeof initial = stored ? JSON.parse(stored) : initial;
    const persist = () => sessionStorage.setItem(KEY, JSON.stringify(state));
    persist();
    (window as unknown as { __heroPush: typeof state }).__heroPush = state;
    const promise = (names: string[]) => names.map((name) => ({ name, rtype: "promise" }));
    const handlers: Record<string, Record<string, (options: Record<string, unknown>) => unknown>> = {
      HeroPush: {
        status: () => ({ distributor: state.distributor, permission: state.permission, reregister: state.reregister }),
        requestPermission: () => {
          if (state.permission === "prompt") state.permission = "granted";
          return { permission: state.permission };
        },
        register: () => {
          if (!state.distributor) throw new Error("no-distributor");
          state.registerCalls++;
          state.reregister = false;
          state.saved = o.register;
          return o.register;
        },
        getSubscription: () => state.saved ?? { endpoint: null },
        takeDropped: () => {
          const endpoint = state.dropped;
          state.dropped = null;
          return { endpoint };
        },
        unregister: () => {
          state.unregisterCalls++;
          state.saved = null;
        },
        appVersion: () => ({ version: "1.0.0", flavor: "play" }),
        removeListener: () => undefined,
      },
      App: { removeListener: () => undefined, exitApp: () => undefined },
    };
    (window as unknown as { CapacitorCustomPlatform: unknown }).CapacitorCustomPlatform = { name: "android" };
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      PluginHeaders: [
        {
          name: "HeroPush",
          methods: [
            ...promise(["status", "requestPermission", "register", "getSubscription", "takeDropped", "unregister", "appVersion", "removeListener"]),
            { name: "addListener", rtype: "callback" },
          ],
        },
        { name: "App", methods: [...promise(["removeListener", "exitApp"]), { name: "addListener", rtype: "callback" }] },
      ],
      nativePromise: async (plugin: string, method: string, options: Record<string, unknown>) => {
        const fn = handlers[plugin]?.[method];
        if (!fn) throw new Error(`${plugin}.${method} is not mocked`);
        const result = fn(options ?? {});
        persist();
        return result;
      },
      nativeCallback: () => `cb-${Math.random().toString(36).slice(2)}`,
    };
  }, opts);
}
