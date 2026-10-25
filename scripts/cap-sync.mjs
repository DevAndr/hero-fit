// npm run cap:dev | cap:prod — синхронизирует android/ с нужным адресом сайта (capacitor.config.ts → server.url).
import { execSync } from "node:child_process";

const URLS = { dev: "http://localhost:3000", prod: "https://hero-fit.ru" };
const mode = process.argv[2];
if (!(mode in URLS)) {
  console.error("Использование: node scripts/cap-sync.mjs dev|prod");
  process.exit(1);
}
execSync("npx cap sync android", { stdio: "inherit", env: { ...process.env, CAP_SERVER_URL: URLS[mode] } });
