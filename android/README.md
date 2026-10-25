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
