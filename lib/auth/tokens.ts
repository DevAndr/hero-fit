import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

export type AccessPayload = { userId: string; sessionId: string };
export type RefreshPayload = AccessPayload & { jti: string };

const ISSUER = "hero-fit";
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export const ACCESS_TTL_SEC = parseTtl(env.JWT_ACCESS_TTL);
export const REFRESH_TTL_SEC = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60;

export async function signAccessToken({ userId, sessionId }: AccessPayload) {
  return new SignJWT({ sid: sessionId, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(accessKey);
}

export async function signRefreshToken({ userId, sessionId }: AccessPayload) {
  const jti = randomUUID();
  const token = await new SignJWT({ sid: sessionId, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SEC}s`)
    .sign(refreshKey);
  return { token, expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000) };
}

export async function verifyAccessToken(token: string | undefined): Promise<AccessPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, accessKey, { issuer: ISSUER, algorithms: ["HS256"] });
    if (payload.typ !== "access" || !payload.sub || typeof payload.sid !== "string") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string | undefined): Promise<RefreshPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, refreshKey, { issuer: ISSUER, algorithms: ["HS256"] });
    if (payload.typ !== "refresh" || !payload.sub || !payload.jti || typeof payload.sid !== "string") {
      return null;
    }
    return { userId: payload.sub, sessionId: payload.sid, jti: payload.jti };
  } catch {
    return null;
  }
}

/** В БД храним только хеш — утечка таблицы не даёт рабочих токенов. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function parseTtl(value: string): number {
  const match = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!match) throw new Error(`Некорректный JWT_ACCESS_TTL: ${value}`);
  const unit = { "": 1, s: 1, m: 60, h: 3600, d: 86400 }[match[2] as "" | "s" | "m" | "h" | "d"];
  return Number(match[1]) * unit;
}
