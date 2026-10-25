# Android-приложение Hero Fit

Обёртка Capacitor 8 над сайтом (спека `docs/superpowers/specs/2026-10-25-native-push-ntfy-design.md`): WebView грузит
сайт по `server.url`, нативное — push через ntfy (UnifiedPush), иконка, App Links. `applicationId` — `ru.herofit.app`
(после публикации не менять).

## Что нужно

- Android Studio (ставит Android SDK; недостающие платформу и build-tools Gradle скачает сам).
- **JDK 21.** JDK 25 из Android Studio Gradle 8.14 не понимает («Unsupported class file major version 69»).
  Например, Temurin 21 архивом в `%LOCALAPPDATA%\jdk-21` и перед сборкой `export JAVA_HOME="$LOCALAPPDATA/jdk-21"`.
- `android/local.properties` (в git не идёт): `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`.

## Адрес сайта

`npm run cap:dev` — приложение смотрит на `http://localhost:3000` (dev-сервер на этом компьютере; на телефоне —
`adb reverse tcp:3000 tcp:3000`). `npm run cap:prod` — на `https://hero-fit.ru`. Команда переписывает
`android/app/src/main/assets/capacitor.config.json` — перед release-сборкой обязательно `cap:prod`.

## Сборки

Flavors (`android/app/build.gradle`): `play` — Google Play, только UnifiedPush; `rustore` и `apk` (с сайта) — с
этапа 3 ещё своё соединение с ntfy. Из `android/`:

```bash
./gradlew assemblePlayDebug                 # отладка
adb install -r app/build/outputs/apk/play/debug/app-play-debug.apk
./gradlew bundlePlayRelease                 # AAB для Google Play
./gradlew assembleRustoreRelease assembleApkRelease
```

## APK на сайте

Лендинг и `/android` дают ссылку `https://hero-fit.ru/download/hero-fit.apk` — **только когда флаг `native_app` включён
всем** (иначе скачавший не сможет включить уведомления). Этот адрес считает нажатие (`ApkDownload`, метрики админки) и
переадресует на `/apk/hero-fit.apk` — файл отдаёт Caddy из `/opt/hero-fit/downloads` (не из образа).
Выложить новую версию (поднять `versionCode`/`versionName` в `app/build.gradle`):

```bash
npm run cap:prod
cd android && ./gradlew assembleApkRelease
ssh deploy@<сервер> "mkdir -p /opt/hero-fit/downloads"
scp app/build/outputs/apk/apk/release/app-apk-release.apk deploy@<сервер>:/opt/hero-fit/downloads/hero-fit.apk
cd .. && npm run cap:dev   # вернуть отладочный адрес
```

Проверка: `curl -sI https://hero-fit.ru/apk/hero-fit.apk` → `200`, `application/vnd.android.package-archive`;
`curl -sI https://hero-fit.ru/download/hero-fit.apk` → `302` на `/apk/hero-fit.apk`.

## Подпись

Один ключ на все магазины, хранится вне репозитория (потеря ключа — новое приложение в магазинах):

```bash
keytool -genkeypair -v -keystore hero-fit.jks -alias hero-fit -keyalg RSA -keysize 4096 -validity 10000
```

`android/keystore.properties` (в `.gitignore`):

```properties
storeFile=../hero-fit.jks
storePassword=...
keyAlias=hero-fit
keyPassword=...
```

SHA-256 ключа для App Links — `keytool -list -v -keystore hero-fit.jks -alias hero-fit` (строка `SHA256:`), в `.env`
сервера — `ANDROID_CERT_SHA256` (через запятую, если ключей несколько: свой и ключ подписи Google Play).

## Ручной чек-лист (push через ntfy)

Локально: в `.env` `NTFY_URL="https://ntfy.sh"` (сервер по умолчанию в приложении ntfy), VAPID-ключи, флаг `native_app`
для своего логина (`/admin/flags`), `npm run dev`, `adb reverse tcp:3000 tcp:3000`, `npm run cap:dev`,
`./gradlew assemblePlayDebug`, `adb install -r …`. Пропал USB — пропал и `adb reverse` (заглушка «Нет связи»).

Пройден 2026-10-25 на Galaxy S24 (Android 16), сборка `play` debug:

- [x] «Включить push» → разрешение Android → «Push включён», в БД подписка `UNIFIEDPUSH`, `appVersion` 1.0.0
- [x] «Отправить тестовое» → уведомление пришло
- [x] Hero Fit смахнут из недавних, экран заблокирован → push «таймер отдыха» × 2 с одним `tag`: одно уведомление в
      канале «Таймер отдыха» (звук, вибрация), нажатие открывает `/stats`
- [x] App Link `adb shell am start -a android.intent.action.VIEW -d https://hero-fit.ru/stats ru.herofit.app` → «Статистика»
- [x] «Назад» Android ходит по истории сайта
- [x] Выход из аккаунта → подписки нет ни в БД, ни в ntfy, `hero_push` пуст
- [x] В ntfy чужой сервер по умолчанию → «В ntfy выбран чужой сервер» и адрес; вернули сервер → «Включить» → новая
      подписка на нужном сервере
- [x] Нет связи с сайтом → заглушка «Нет связи с Hero Fit» (`server.errorPath`)
- [ ] Удаление приложения ntfy → подписка снимается (не проверялось)
- [ ] Release-сборка с `cap:prod` и подписью, App Links с проверкой на проде (нужен `ANDROID_CERT_SHA256` на сервере)
