/** Кнопка «Скачать APK»: маршрут считает нажатие (ApkDownload) и переадресует на файл. */
export const APK_URL = "/download/hero-fit.apk";
/** Сам файл (сборка `apk`): Caddy отдаёт /opt/hero-fit/downloads — выкладка в android/README.md. */
export const APK_FILE = "/apk/hero-fit.apk";
/** minSdk 24 (android/variables.gradle). */
export const APK_MIN_ANDROID = "7";
