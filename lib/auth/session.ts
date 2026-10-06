import "server-only";
import { db } from "@/lib/db";
import type { IssuedTokens } from "@/lib/auth/cookies";
import {
  hashToken,
  REFRESH_TTL_SEC,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth/tokens";

/**
 * Окно, в котором повторное предъявление уже использованного refresh-токена
 * считается гонкой параллельных запросов (prefetch, несколько вкладок), а не кражей.
 */
const REUSE_GRACE_MS = 30_000;

type ClientMeta = { userAgent?: string | null; ip?: string | null };

export async function createSession(userId: string, meta: ClientMeta = {}): Promise<IssuedTokens> {
  const session = await db.session.create({
    data: {
      userId,
      userAgent: meta.userAgent?.slice(0, 512),
      ip: meta.ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    },
  });
  return issueTokens(userId, session.id);
}

export type RotateResult =
  | { ok: true; userId: string; sessionId: string; tokens: Partial<IssuedTokens> }
  | { ok: false };

/**
 * Ротация: старый refresh помечается использованным, выдаётся новая пара.
 * Повторное использование вне grace-окна → вся сессия попадает в blacklist.
 */
export async function rotateRefreshToken(refreshToken: string | undefined): Promise<RotateResult> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload || !refreshToken) return { ok: false };

  const tokenHash = hashToken(refreshToken);
  const record = await db.refreshToken.findUnique({
    where: { tokenHash },
    include: { session: true },
  });

  const { session } = record ?? {};
  if (
    !record ||
    !session ||
    session.id !== payload.sessionId ||
    session.userId !== payload.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    record.expiresAt <= new Date()
  ) {
    return { ok: false };
  }

  // Атомарно «захватываем» токен: из параллельных запросов выигрывает только один.
  const claimed = await db.refreshToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (claimed.count === 0) {
    const fresh = await db.refreshToken.findUnique({ where: { id: record.id } });
    const usedAt = fresh?.usedAt?.getTime() ?? 0;
    if (Date.now() - usedAt <= REUSE_GRACE_MS) {
      // Гонка: новую пару уже получил соседний запрос — выдаём только access.
      const accessToken = await signAccessToken({ userId: session.userId, sessionId: session.id });
      return { ok: true, userId: session.userId, sessionId: session.id, tokens: { accessToken } };
    }
    await revokeSession(session.id);
    return { ok: false };
  }

  await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  const tokens = await issueTokens(session.userId, session.id);
  return { ok: true, userId: session.userId, sessionId: session.id, tokens };
}

export async function revokeSession(sessionId: string) {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(userId: string, sessionId: string): Promise<IssuedTokens> {
  const [accessToken, refresh] = await Promise.all([
    signAccessToken({ userId, sessionId }),
    signRefreshToken({ userId, sessionId }),
  ]);
  await db.refreshToken.create({
    data: { sessionId, tokenHash: hashToken(refresh.token), expiresAt: refresh.expiresAt },
  });
  return { accessToken, refreshToken: refresh.token };
}
