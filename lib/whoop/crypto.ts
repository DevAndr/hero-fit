import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Шифрование токенов WHOOP (AES-256-GCM). Формат: `iv.tag.data` в base64url, IV — 12 байт. */

function keyBuffer(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("Ключ шифрования должен быть 32 байта (base64)");
  return key;
}

export function encryptToken(plain: string, keyB64: string): string {
  const key = keyBuffer(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(enc: string, keyB64: string): string {
  const key = keyBuffer(keyB64);
  const parts = enc.split(".");
  if (parts.length !== 3) throw new Error("Некорректный формат зашифрованного токена");
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Некорректный формат зашифрованного токена");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
