import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 5 * 60_000;
const MAX_FUTURE_MS = 60_000;

/** X-WHOOP-Signature = base64(HMAC-SHA256(timestamp + сырое тело, secret)). */
export function verifyWhoopSignature(i: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  now: number;
}): boolean {
  if (!i.signature || !i.timestamp) return false;
  const ts = Number(i.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (i.now - ts > MAX_AGE_MS || ts - i.now > MAX_FUTURE_MS) return false;
  const expected = Buffer.from(createHmac("sha256", i.secret).update(i.timestamp + i.body).digest("base64"));
  const given = Buffer.from(i.signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
