import { createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { CERT_PATH, KEY_PATH } from "./certs";

/**
 * Фейковый push-сервис (как FCM/Mozilla) для e2e: принимает Web Push по HTTPS и расшифровывает
 * payload (RFC 8291, aes128gcm) ключами подписки — проверяем доставку целиком, без браузера.
 */
export type ReceivedPush = { headers: Record<string, string | string[] | undefined>; payload: Record<string, unknown> };

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

export function createSubscriptionKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    authB64: auth.toString("base64url"),
  };
}

function decrypt(body: Buffer, keys: ReturnType<typeof createSubscriptionKeys>) {
  const salt = body.subarray(0, 16);
  const idLen = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + idLen);
  const ciphertext = body.subarray(21 + idLen);

  const ecdhSecret = keys.ecdh.computeSecret(senderPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), keys.ecdh.getPublicKey(), senderPublic, Buffer.from([1])]);
  const ikm = hmac(hmac(keys.auth, ecdhSecret), keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);

  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  const end = padded.lastIndexOf(2); // разделитель последней записи, дальше — нули паддинга
  return JSON.parse(padded.subarray(0, end).toString("utf8"));
}

export async function startPushService({ status = 201 }: { status?: number } = {}) {
  const keys = createSubscriptionKeys();
  const received: ReceivedPush[] = [];
  const errors: string[] = [];
  let requests = 0;
  const server = createServer({ key: readFileSync(KEY_PATH), cert: readFileSync(CERT_PATH) }, (req, res) => {
    requests++;
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        received.push({ headers: req.headers, payload: decrypt(Buffer.concat(chunks), keys) });
      } catch (e) {
        errors.push((e as Error).message);
      }
      res.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `https://127.0.0.1:${port}/push/${randomBytes(8).toString("hex")}`,
    p256dh: keys.p256dh,
    auth: keys.authB64,
    received,
    errors,
    requests: () => requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
