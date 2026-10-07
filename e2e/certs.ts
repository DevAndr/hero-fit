import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Самоподписанный сертификат localhost для фейкового push-сервиса (сервер доверяет ему через NODE_EXTRA_CA_CERTS). */
const DIR = join(__dirname, ".certs");
export const CERT_PATH = join(DIR, "localhost.crt");
export const KEY_PATH = join(DIR, "localhost.key");

export function ensureCerts() {
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) return;
  mkdirSync(DIR, { recursive: true });
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3650",
    "-keyout", KEY_PATH, "-out", CERT_PATH,
    "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ], { stdio: "ignore", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
}
