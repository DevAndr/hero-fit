import type { CapacitorConfig } from "@capacitor/cli";

// Android-обёртка грузит сайт по URL (Server Components и Server Actions — встроить статику нельзя).
// CAP_SERVER_URL задаёт scripts/cap-sync.mjs: dev — localhost:3000 через adb reverse, prod — боевой домен.
const url = process.env.CAP_SERVER_URL ?? "https://hero-fit.ru";

const config: CapacitorConfig = {
  appId: "ru.herofit.app",
  appName: "Hero Fit",
  // Заглушка: Capacitor требует webDir, а страницы приходят с server.url
  webDir: "capacitor-web",
  // Старт — кабинет (без входа proxy отправит на /login), а не лендинг
  server: { url, appStartPath: "/dashboard", cleartext: url.startsWith("http://") },
  android: { allowMixedContent: false },
};

export default config;
