# Push через ntfy — этап 2 (Android-обёртка и UnifiedPush) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android-приложение Hero Fit (Capacitor, грузит сайт) получает push через приложение ntfy (UnifiedPush) и показывает их как нативные уведомления; сборка `play` готова к ручной проверке и публикации.

**Architecture:** Проект `android/` на Capacitor 8 с тремя flavors. Локальный Kotlin-плагин `HeroPush` оборачивает `org.unifiedpush.android:connector` 3.3.5 (библиотека сама генерирует ключи Web Push и расшифровывает), `HeroPushService` показывает уведомление по каналу `NotificationType`. Веб-слой: `PushProvider` при `Capacitor.isNativePlatform()` идёт через `HeroPush` вместо service worker, решение о статусе — чистая функция; `/settings` показывает подсказки. Сервер не меняется (этап 1), кроме публичного `assetlinks.json` и строки в `/privacy`.

**Tech Stack:** Capacitor 8.5.3 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`, `@capacitor/app` 8.1.2), Kotlin, Gradle (Android SDK 36, JDK из Android Studio), UnifiedPush connector 3.3.5, Next.js 16, Vitest, Playwright, JUnit.

**Spec:** `docs/superpowers/specs/2026-10-25-native-push-ntfy-design.md` (этап 2)

## Global Constraints

- Ветка фичи — `feat/native-push-app` от `release/2027-05-native`; в релизную — `git merge --no-ff`, ветку удалить.
- `applicationId` — `ru.herofit.app` (не менять: после публикации в магазинах нельзя). Flavors — `play`, `rustore`, `apk`, `applicationId` общий.
- `server.url`: release — `https://hero-fit.ru`; debug — `http://localhost:3000` через `adb reverse tcp:3000 tcp:3000` (переключается переменной `CAP_SERVER_URL` при `cap sync`).
- В этапе 2 все flavors ведут себя как `play` (своего соединения нет — этап 3); разница flavors пока только в имени и манифесте.
- В `play` нет `FOREGROUND_SERVICE` и `FOREGROUND_SERVICE_SPECIAL_USE`. Добавлять их — только этап 3 и только в `rustore`/`apk`.
- Подписка из приложения — `kind: "UNIFIEDPUSH"`, `appVersion` = `versionName` приложения; принимается сервером только с хоста `NTFY_URL` и при флаге `native_app` (этап 1).
- Ключ подписи и пароли — вне репозитория (`android/keystore.properties` и `*.jks` в `.gitignore`).
- Новых зависимостей npm — только четыре пакета Capacitor выше; после установки перестроить lock в Linux (команда из CLAUDE.md).
- Разработка на телефоне: в локальном `.env` `NTFY_URL="https://ntfy.sh"` (сервер по умолчанию в приложении ntfy; тело зашифровано), на проде — `https://push.hero-fit.ru`.

## Review Focus

- Push пришёл, когда приложение Hero Fit закрыто (процесс убит) — уведомление показано (ручной чек-лист, Task 6).
- Нажатие на уведомление открывает `url` из push в WebView, а не главную; `url` вида `//evil.com` или `https://evil.com` — открывается `/dashboard` (JUnit в Task 2).
- Пользователь удалил ntfy или сменил сервер — при следующем запуске сервер узнаёт: подписка удаляется (e2e в Task 3).
- Выход из аккаунта в приложении — подписка удалена на сервере и снята в ntfy; новый пользователь на том же телефоне не получает чужих push (e2e в Task 3).
- Два push с одним `tag` (таймер отдыха) — второе заменяет первое, а не копится (JUnit на id уведомления в Task 2).

---

### Task 1: Каркас Capacitor и сборки

**Files:**
- Modify: `package.json` (зависимости, скрипты), `package-lock.json` (перестроить в Linux), `.gitignore`
- Create: `capacitor.config.ts`, `android/` (через `npx cap add android`), `android/app/build.gradle` (flavors, подпись), `android/README.md`
- Create: `scripts/cap-sync.mjs`

**Interfaces:**
- Produces: скрипты `npm run cap:dev` (sync с `CAP_SERVER_URL=http://localhost:3000`, `cleartext: true`) и `npm run cap:prod` (sync с `https://hero-fit.ru`); задачи Gradle `assemblePlayDebug`, `assemblePlayRelease`, `assembleRustoreRelease`, `assembleApkRelease`; `BuildConfig.FLAVOR` ∈ `play|rustore|apk`.

- [ ] **Step 1:** `npm i @capacitor/core@8.5.3 @capacitor/android@8.5.3 @capacitor/app@8.1.2 && npm i -D @capacitor/cli@8.5.3`.
- [ ] **Step 2:** `capacitor.config.ts`: `appId: "ru.herofit.app"`, `appName: "Hero Fit"`, `webDir: "capacitor-web"` (папка с одной заглушкой `index.html` «Нет сети» — Capacitor требует webDir; в `.gitignore` не класть), `server: { url: process.env.CAP_SERVER_URL ?? "https://hero-fit.ru", cleartext: url.startsWith("http://"), allowNavigation: [] }`, `android: { allowMixedContent: false }`. `scripts/cap-sync.mjs` ставит `CAP_SERVER_URL` по аргументу `dev|prod` и запускает `npx cap sync android`.
- [ ] **Step 3:** `npx cap add android`. В `android/app/build.gradle`: `flavorDimensions "store"`, `productFlavors { play {}; rustore {}; apk {} }`, `versionName "1.0.0"`, `versionCode 1`; `signingConfigs.release` из `android/keystore.properties` (если файла нет — release не подписывается, debug работает). В `.gitignore`: `android/keystore.properties`, `*.jks`, `android/app/build/`, `android/.gradle/`.
- [ ] **Step 4:** Иконка и сплэш — из `app/pwa-icon` (512 px) в `android/app/src/main/res/mipmap-*` (adaptive icon: фон — цвет `primary` светлой темы). Тёмная строка состояния не трогается.
- [ ] **Step 5:** Проверка сборки: `npm run cap:dev && cd android && ./gradlew assemblePlayDebug` — Expected: `BUILD SUCCESSFUL`.
- [ ] **Step 6:** Проверка на телефоне: `npm run dev` (в другом терминале), `adb reverse tcp:3000 tcp:3000`, `adb install -r android/app/build/outputs/apk/play/debug/app-play-debug.apk`, запустить — Expected: открывается вход Hero Fit, вход `demo`/`Demo1234` работает, кнопка «Назад» Android ходит по истории (через `@capacitor/app` `backButton`, иначе приложение закрывается — обработчик в Task 3).
- [ ] **Step 7:** `android/README.md`: требования (Android Studio, SDK 36), `cap:dev`/`cap:prod`, `adb reverse`, сборка трёх flavors, создание ключа (`keytool -genkeypair -v -keystore hero-fit.jks -alias hero-fit -keyalg RSA -keysize 4096 -validity 10000`), формат `keystore.properties`, где взять SHA-256 для App Links (`keytool -list -v`).
- [ ] **Step 8:** Перестроить lock: `docker run --rm -v "$PWD:/app" -w /app node:24 npm install --package-lock-only --ignore-scripts`; `npm run typecheck && npm run lint && npm test` — Expected: PASS.
- [ ] **Step 9:** Commit: `feat(android): Capacitor shell with play/rustore/apk flavors`.

### Task 2: Плагин `HeroPush` и показ уведомлений (Kotlin)

**Files:**
- Create: `android/app/src/main/java/ru/herofit/app/push/HeroPushPlugin.kt`, `HeroPushService.kt`, `PushStore.kt`, `Notifications.kt`
- Modify: `android/app/src/main/java/ru/herofit/app/MainActivity.kt`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`
- Test: `android/app/src/test/java/ru/herofit/app/push/NotificationsTest.kt`

**Interfaces:**
- Consumes: `org.unifiedpush.android:connector:3.3.5` — `UnifiedPush.getDistributors(context): List<String>`, `UnifiedPush.getAckDistributor(context): String?`, `UnifiedPush.tryUseCurrentOrDefaultDistributor(activity) { ok -> }`, `UnifiedPush.register(context, instance, messageForDistributor, vapid)`, `UnifiedPush.unregister(context, instance)`; `PushService` с `onNewEndpoint(endpoint: PushEndpoint, instance)`, `onMessage(message: PushMessage, instance)` (`message.decrypted`, `message.content`), `onRegistrationFailed(reason: FailedReason, instance)`, `onUnregistered(instance)`; `PushEndpoint.url`, `PushEndpoint.pubKeySet?.pubKey/auth`.
- Produces (JS-API плагина, имя `HeroPush`):
  - `status(): Promise<{ distributor: boolean; permission: "granted" | "denied" | "prompt" }>`
  - `requestPermission(): Promise<{ permission: "granted" | "denied" }>` (Android 13+ `POST_NOTIFICATIONS`, ниже — сразу `granted`)
  - `register({ vapid: string }): Promise<{ endpoint: string; p256dh: string; auth: string }>` — ждёт `onNewEndpoint` до 20 с; ошибки: `"no-distributor"`, `"failed:<FailedReason>"`, `"timeout"`
  - `getSubscription(): Promise<{ endpoint: string; p256dh: string; auth: string } | { endpoint: null }>` — сохранённая в `PushStore`
  - `takeDropped(): Promise<{ endpoint: string | null }>` — эндпоинт, снятый `onUnregistered`/сменённый, пока веб не видел; читается один раз
  - `unregister(): Promise<void>`
  - `appVersion(): Promise<{ version: string; flavor: string }>`
  - событие `subscriptionChanged` с `{ endpoint, p256dh, auth }` или `{ endpoint: null }`
- Produces (Kotlin, чистые функции в `Notifications.kt`): `channelFor(type: String?): String`, `notificationId(tag: String?): Int`, `safePath(url: String?): String`.

- [ ] **Step 1: Write the failing tests** — `NotificationsTest.kt`:

```kotlin
@Test fun channels() {
  assertEquals("rest", channelFor("REST"))
  listOf("STREAK", "PLAN", "RECAP", "COMEBACK", "GOAL").forEach { assertEquals("reminders", channelFor(it)) }
  listOf("ACHIEVEMENT", "BOSS", "RAID").forEach { assertEquals("game", channelFor(it)) }
  assertEquals("social", channelFor("SOCIAL"))
  assertEquals("coach", channelFor("COACH"))
  listOf("SYSTEM", "FEEDBACK", "NEW_TYPE", null).forEach { assertEquals("system", channelFor(it)) }
}
@Test fun sameTagSameId() {
  assertEquals(notificationId("hero-fit-rest"), notificationId("hero-fit-rest"))
  assertNotEquals(notificationId("hero-fit-rest"), notificationId("hero-fit-streak"))
}
@Test fun safePathOnlyOwnPaths() {
  assertEquals("/workouts/abc?x=1", safePath("/workouts/abc?x=1"))
  listOf(null, "", "//evil.com", "https://evil.com", "javascript:alert(1)", "workouts").forEach { assertEquals("/dashboard", safePath(it)) }
}
```

- [ ] **Step 2:** Run: `cd android && ./gradlew testPlayDebugUnitTest` — Expected: FAIL (функций нет).
- [ ] **Step 3: Implement** `Notifications.kt`: три функции + `ensureChannels(context)` — каналы `rest` «Таймер отдыха» (`IMPORTANCE_HIGH`, вибрация), `reminders` «Серия и напоминания», `game` «Ачивки и игра», `social` «Друзья и гильдии», `coach` «Тренер», `system` «Системные» (все `IMPORTANCE_DEFAULT`); `show(context, json: String)` — разбор `{type,title,body,url,tag}` (`org.json`), `NotificationCompat` с иконкой `ic_stat_hero` (белый силуэт из иконки приложения), `setAutoCancel(true)`, `PendingIntent` на `MainActivity` с extra `hero_url = safePath(url)` (`FLAG_IMMUTABLE | FLAG_UPDATE_CURRENT`), id — `notificationId(tag)`.
- [ ] **Step 4:** Run: `./gradlew testPlayDebugUnitTest` — Expected: PASS.
- [ ] **Step 5: Implement** `PushStore.kt` (SharedPreferences `hero_push`: `endpoint`, `p256dh`, `auth`, `dropped`), `HeroPushService : PushService` (`onNewEndpoint` → прежний эндпоинт ≠ новый — в `dropped`; сохранить; `HeroPushPlugin.emit(...)` и завершить ожидающий `register`; `onMessage` → `if (message.decrypted) show(this, String(message.content))`; `onRegistrationFailed` → отклонить ожидающий `register`; `onUnregistered` → эндпоинт в `dropped`, очистить, событие `{ endpoint: null }`), `HeroPushPlugin` (`@CapacitorPlugin(name = "HeroPush", permissions = [Permission(alias = "notifications", strings = [POST_NOTIFICATIONS])])`, методы из Interfaces; связь сервиса с плагином — статическая ссылка на последний экземпляр плагина, `null`-безопасно: приложение может быть закрыто). Instance UnifiedPush — `UnifiedPush.INSTANCE_DEFAULT`.
- [ ] **Step 6:** Manifest: `<service android:name=".push.HeroPushService" android:exported="false"><intent-filter><action android:name="org.unifiedpush.android.connector.PUSH_EVENT"/></intent-filter></service>`, `POST_NOTIFICATIONS`. `MainActivity`: `registerPlugin(HeroPushPlugin::class.java)` до `super.onCreate`, `ensureChannels(this)`; `onCreate`/`onNewIntent` с extra `hero_url` → `bridge.webView.loadUrl(serverBase + path)` (`serverBase` — из `bridge.serverUrl`, без хвостового `/`).
- [ ] **Step 7:** Run: `./gradlew testPlayDebugUnitTest assemblePlayDebug assembleRustoreDebug assembleApkDebug` — Expected: `BUILD SUCCESSFUL`; `aapt2 dump permissions` (или `apkanalyzer manifest permissions`) для `app-play-debug.apk` не содержит `FOREGROUND_SERVICE`.
- [ ] **Step 8:** Commit: `feat(android): HeroPush plugin over UnifiedPush, notification channels`.

### Task 3: Веб-слой — `PushProvider` в приложении, `/settings`, выход

**Files:**
- Create: `lib/native/hero-push.ts`, `lib/native/push-state.ts`
- Test: `lib/native/push-state.test.ts`
- Modify: `components/notifications/push-provider.tsx`, `components/notifications/notification-settings.tsx` (`PushDeviceCard`), `app/(app)/layout.tsx:97` (передать `ntfyUrl`), `components/app/user-menu.tsx:223` (без изменений, если `forgetDevice` закрывает и нативное), `app/(app)/settings/page.tsx:87` (нативная версия — клиентский компонент рядом)
- Create: `e2e/native-push.spec.ts`, `e2e/native-mock.ts`
- Modify: `playwright.config.ts` (env сервера `NTFY_URL: "https://127.0.0.1"`)

**Interfaces:**
- Consumes: JS-API `HeroPush` (Task 2); `subscribePushAction(input)` / `unsubscribePushAction(endpoint)` (этап 1, `kind`/`appVersion`); `ntfyHost(url)` из `lib/notifications/push-hosts.ts` (без `server-only` — можно в клиенте).
- Produces:
  - `lib/native/hero-push.ts`: `export const HeroPush = registerPlugin<HeroPushPlugin>("HeroPush")`, тип `HeroPushPlugin` по Interfaces Task 2, `isNativeApp(): boolean` (`Capacitor.isNativePlatform()`).
  - `lib/native/push-state.ts`: `type NativePushReason = "no-distributor" | "foreign-server" | "permission" | "server-off" | null`; `nativePushReason(input: { distributor: boolean; permission: "granted" | "denied" | "prompt"; endpoint: string | null; ntfyHost: string | null }): NativePushReason` — порядок: `ntfyHost === null` → `server-off`; `!distributor` → `no-distributor`; `permission === "denied"` → `permission`; `endpoint` есть и хост ≠ `ntfyHost` → `foreign-server`; иначе `null`.
  - `PushApi` получает поля `native: boolean`, `nativeReason: NativePushReason`, `ntfyUrl: string | null`.

- [ ] **Step 1: Write the failing tests** — `push-state.test.ts`: по одному `it` на каждую ветку порядка выше (включая «нет ntfy на сервере важнее нет дистрибьютора», «эндпоинт на `ntfy.sh` при `push.hero-fit.ru` → `foreign-server`», «`PUSH.hero-fit.ru:443` = свой», «эндпоинта ещё нет → `null`»).
- [ ] **Step 2:** Run: `npx vitest run lib/native` — Expected: FAIL.
- [ ] **Step 3: Implement** `push-state.ts` и `hero-push.ts`. Run: `npx vitest run lib/native` — Expected: PASS.
- [ ] **Step 4:** `PushProvider({ vapidKey, ntfyUrl, children })`: при `isNativeApp()` service worker не регистрируется. При старте: `takeDropped()` → если эндпоинт, `unsubscribePushAction(it)`; `getSubscription()` → если есть, `subscribePushAction({ endpoint, keys: { p256dh, auth }, kind: "UNIFIEDPUSH", appVersion })`, при `{ ok: false }` подписка считается выключенной; `status()` → `nativeReason`. `subscribe()`: `requestPermission()` → `register({ vapid: vapidKey })` → проверка хоста (`foreign-server` — не сохранять) → `subscribePushAction(...)`. `unsubscribe()` и `forgetDevice()`: `unsubscribePushAction(endpoint)` + `HeroPush.unregister()`. Слушатель `subscriptionChanged`: новый эндпоинт → сохранить, `null` → `unsubscribePushAction(старый)`. `supported` в приложении = `true`. Кнопка «Назад»: `App.addListener("backButton", ({ canGoBack }) => canGoBack ? history.back() : App.exitApp())` — только в приложении.
- [ ] **Step 5:** `layout.tsx`: `ntfyUrl={env.NTFY_URL ?? null}`. `PushDeviceCard` в приложении — тексты по `nativeReason`:
  - `server-off`: «Уведомления в приложении пока недоступны.»
  - `no-distributor`: «Уведомления приходят через бесплатное приложение ntfy. Установите его и вернитесь сюда.» + ссылки «RuStore», «F-Droid», «Google Play» (внешние, `target="_blank"`)
  - `foreign-server`: «В ntfy выбран чужой сервер. Откройте ntfy → Настройки → Сервер по умолчанию и укажите адрес ниже, затем включите уведомления снова.» + адрес `NTFY_URL` и кнопка «Скопировать адрес» (`navigator.clipboard.writeText`, после — «Скопировано»)
  - `permission`: «Уведомления запрещены в настройках Android для Hero Fit.»
  - `null` — как в вебе («Push включён на этом устройстве.» / «выключен»).
  Рядом со строкой версии в `/settings` — клиентский `NativeVersion`: в приложении « · Android {version} ({flavor})», в браузере — ничего.
- [ ] **Step 6:** `e2e/native-mock.ts`: `mockNativeApp(page, opts: { distributor?: boolean; permission?: "granted" | "denied"; endpoint: string; keys: { p256dh: string; auth: string }; dropped?: string | null })` — `page.addInitScript` ставит `window.CapacitorCustomPlatform = { name: "android" }` и `window.Capacitor = { PluginHeaders: [{ name: "HeroPush", methods: [...все методы как rtype "promise", addListener — "callback"] }, { name: "App", methods: [...] }], nativePromise(plugin, method, options) {...}, nativeCallback() {...} }`; фейк хранит состояние в `window.__heroPush` (вызовы `unregister` считаются). `playwright.config.ts`: `NTFY_URL: "https://127.0.0.1"` в env сервера.
- [ ] **Step 7:** `e2e/native-push.spec.ts` (параллельно, флаг — `addFlagUser("native_app", login)`; только desktop — мобильный проект эмулирует браузер, а не приложение):
  - `app: enabling push saves a UNIFIEDPUSH subscription and delivers a push` — `startPushService()`, мок с его `endpoint`/ключами, `/settings` → «Включить» → строка с `kind = 'UNIFIEDPUSH'`, `appVersion` из мока; `setDueStreak` + `runTick(request, at, "reminders")` → `push.received` = 1.
  - `app: ntfy on a foreign server — hint, nothing saved` — мок с `https://ntfy.sh/upAbcdefghijkl` → текст «В ntfy выбран чужой сервер», адрес `https://127.0.0.1`, строк нет.
  - `app: no distributor — install hint` — `distributor: false` → «Установите его», строк нет.
  - `app: without the native_app flag nothing is saved` — без `addFlagUser` → после «Включить» строк нет, статус «выключен».
  - `app: logout removes the subscription and unregisters` — включить, выйти через меню → строк нет, `window.__heroPush.unregisterCalls` = 1.
  - `app: dropped endpoint is removed on start` — подписка в БД (`addSubscription(login, push, "UNIFIEDPUSH")`), мок с `dropped: push.endpoint` и без сохранённой подписки → после загрузки `/dashboard` строк нет.
  - `browser: no native hints, service worker path unchanged` — без мока `/settings` не содержит «ntfy».
- [ ] **Step 8:** Run: `npm run typecheck && npm run lint && npx vitest run lib/native lib/notifications && npm run build && npx playwright test e2e/native-push.spec.ts e2e/notifications.spec.ts --project=desktop` — Expected: PASS.
- [ ] **Step 9:** Commit: `feat(push): native PushProvider path, settings hints, logout cleanup`.

### Task 4: App Links, `/privacy`, документация

**Files:**
- Create: `app/.well-known/assetlinks.json/route.ts`, `lib/native/assetlinks.ts`
- Test: `lib/native/assetlinks.test.ts`
- Modify: `proxy.ts:27` (`/.well-known/assetlinks.json` в `PUBLIC_PAGES`), `lib/env.ts` (`ANDROID_CERT_SHA256` — необязательный, через запятую), `.env.example`, `deploy/.env.example`, `android/app/src/main/AndroidManifest.xml` (intent-filter `autoVerify` на `https://hero-fit.ru`), `app/(marketing)/privacy/page.tsx`, `docs/features/platform.md`

**Interfaces:**
- Produces: `assetLinks(fingerprints: string | undefined): object[]` — пусто/`undefined` → `[]`; иначе `[{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "ru.herofit.app", sha256_cert_fingerprints: [...] } }]` (отпечатки — обрезанные, в верхнем регистре, пустые выброшены).

- [ ] **Step 1: Write the failing test** — `assetlinks.test.ts`: `assetLinks(undefined)` и `assetLinks("")` → `[]`; `assetLinks(" aa:bb ,CC:DD,")` → один объект с `package_name: "ru.herofit.app"` и `sha256_cert_fingerprints: ["AA:BB", "CC:DD"]`.
- [ ] **Step 2:** Run: `npx vitest run lib/native/assetlinks.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement `assetlinks.ts`; route `GET` → `Response.json(assetLinks(env.ANDROID_CERT_SHA256))` с `Cache-Control: public, max-age=3600`; `PUBLIC_PAGES` += `"/.well-known/assetlinks.json"`; env + оба `.env.example` с комментарием «SHA-256 ключа подписи Android-приложения (android/README.md), через запятую — App Links». Run: `npx vitest run lib/native` — Expected: PASS.
- [ ] **Step 4:** e2e в `e2e/native-push.spec.ts`: `assetlinks.json is public JSON` — `request.get("/.well-known/assetlinks.json")` без входа → 200, `application/json`, тело — массив.
- [ ] **Step 5:** `/privacy`: в список получателей рядом с push-сервисами браузеров — «Приложение Hero Fit для Android получает уведомления через наш сервер ntfy в России; содержимое зашифровано ключом вашего телефона, сервер его не видит. Если в приложении ntfy вы выбрали другой сервер, уведомления не придут.» (по реальности этапа 2: чужие серверы не принимаются).
- [ ] **Step 6:** `docs/features/platform.md` — абзац про приложение: Capacitor, flavors, `HeroPush` (методы, `PushStore`, `dropped`), каналы, `safePath`, `PushProvider` в приложении и `nativePushReason`, тексты `/settings`, `assetlinks.json` и `ANDROID_CERT_SHA256`, e2e-мок `mockNativeApp`, локальная проверка с `NTFY_URL=https://ntfy.sh`, ссылка на `android/README.md`.
- [ ] **Step 7:** Run: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test e2e/native-push.spec.ts --project=desktop` — Expected: PASS.
- [ ] **Step 8:** Commit: `feat(android): App Links, privacy note, docs`.

### Task 5: Проверка на телефоне (Samsung S24, Android 16)

**Files:**
- Modify: `android/README.md` (раздел «Ручной чек-лист» — по шагам ниже, с отметкой даты прохождения)

- [ ] **Step 1:** Локально: `.env` — `NTFY_URL="https://ntfy.sh"`, VAPID-ключи есть; флаг `native_app` для `demo` (`/admin/flags`); `npm run dev`, `adb reverse tcp:3000 tcp:3000`, `npm run cap:dev`, `./gradlew assemblePlayDebug`, `adb install -r …`.
- [ ] **Step 2:** В ntfy на телефоне сервер по умолчанию — `ntfy.sh`. `/settings` → «Включить» → разрешение Android → Expected: «Push включён на этом устройстве»; в БД подписка `UNIFIEDPUSH` с хостом `ntfy.sh`.
- [ ] **Step 3:** `/settings` → «Проверить push» (`sendTestPushAction`) — Expected: уведомление в канале «Системные», нажатие открывает `/dashboard`.
- [ ] **Step 4:** Свернуть Hero Fit, смахнуть из недавних, заблокировать экран → «Проверить push» с компьютера (тот же пользователь в браузере) — Expected: уведомление приходит, нажатие запускает приложение на нужной странице.
- [ ] **Step 5:** Таймер отдыха в тренировке: 2 раза подряд — Expected: одно уведомление «Таймер отдыха» (замена по `tag`), со звуком и вибрацией.
- [ ] **Step 6:** Сменить в ntfy сервер на `https://push.hero-fit.ru` (или любой другой) → открыть Hero Fit — Expected: подписка в БД удалена (`dropped`), в `/settings` — «В ntfy выбран чужой сервер». Вернуть `ntfy.sh` → «Включить» → снова работает.
- [ ] **Step 7:** Выход из аккаунта → Expected: подписки нет в БД, в ntfy исчезла подписка Hero Fit.
- [ ] **Step 8:** Удалить ntfy → открыть Hero Fit → Expected: подписка удалена, «Установите его».
- [ ] **Step 9:** Записать результат в `android/README.md`, commit: `docs(android): manual checklist passed on Galaxy S24 / Android 16`.

### Завершение

- [ ] Полный прогон: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` и `cd android && ./gradlew testPlayDebugUnitTest` — Expected: всё зелёное.
- [ ] Ревью ветки, затем `git switch release/2027-05-native && git merge --no-ff feat/native-push-app && git branch -d feat/native-push-app`.
