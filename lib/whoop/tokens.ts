import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptToken, encryptToken } from "./crypto";
import { oauthUrl, redirectUri } from "./config";

/** Доступ WHOOP отозван или refresh отклонён — пользователю нужно переподключить браслет. */
export class WhoopReauthError extends Error {
  constructor(message = "whoop reauth") {
    super(message);
    this.name = "WhoopReauthError";
  }
}

/** WHOOP временно недоступен (429, 5xx, таймаут, сеть). Сообщение — только статус, без тел ответов. */
export class WhoopUnavailableError extends Error {
  constructor(message = "whoop unavailable") {
    super(message);
    this.name = "WhoopUnavailableError";
  }
}

export type WhoopTokenSet = { accessToken: string; refreshToken: string; expiresAt: Date };

const TIMEOUT_MS = 10_000;
/** Токен, которому жить меньше этого, считаем истёкшим. */
const EXPIRY_MARGIN_MS = 60_000;

function credentials(): { clientId: string; clientSecret: string; key: string } {
  const { WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_TOKEN_KEY } = env;
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_TOKEN_KEY) {
    throw new WhoopUnavailableError("whoop not configured");
  }
  return { clientId: WHOOP_CLIENT_ID, clientSecret: WHOOP_CLIENT_SECRET, key: WHOOP_TOKEN_KEY };
}

/**
 * POST на эндпоинт токенов WHOOP. 400/401 → WhoopReauthError (код или refresh отклонён),
 * остальные ошибки → WhoopUnavailableError. В ошибках — только статус.
 */
async function postToken(params: Record<string, string>): Promise<WhoopTokenSet> {
  let res: Response;
  try {
    res = await fetch(oauthUrl("token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new WhoopUnavailableError("whoop token request failed");
  }
  if (res.status === 400 || res.status === 401) throw new WhoopReauthError(`whoop ${res.status}`);
  if (!res.ok) throw new WhoopUnavailableError(`whoop ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new WhoopUnavailableError("whoop token response invalid");
  }
  return parseTokenResponse(body);
}

function parseTokenResponse(body: unknown): WhoopTokenSet {
  const b = (body ?? {}) as Record<string, unknown>;
  const { access_token, refresh_token, expires_in } = b;
  if (
    typeof access_token !== "string" ||
    !access_token ||
    typeof refresh_token !== "string" ||
    !refresh_token ||
    typeof expires_in !== "number" ||
    !Number.isFinite(expires_in)
  ) {
    throw new WhoopUnavailableError("whoop token response invalid");
  }
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + expires_in * 1000),
  };
}

/** Обмен кода авторизации на токены (callback OAuth). */
export async function exchangeCode(code: string): Promise<WhoopTokenSet> {
  const { clientId, clientSecret } = credentials();
  return postToken({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
  });
}

/** Внутренний сигнал: refresh отклонён внутри транзакции (откатывается), пометка ставится после неё. */
class RefreshRejected extends Error {}

/**
 * Действующий access-токен пользователя. Свежий (живёт > 60 с) — сразу из БД.
 * Иначе — под advisory lock на пользователя: перечитать строку (параллельный запрос мог уже обновить),
 * при необходимости refresh и запись. Refresh ротируется (старый недействителен сразу, второй одновременный
 * refresh падает), поэтому без блокировки два запроса сожгли бы подключение.
 *
 * `rejected` (для повтора на 401 в `lib/whoop/client.ts`) — access-токен, на который WHOOP ответил 401:
 * обновить принудительно, если в БД всё ещё он; если другой запрос уже обновил — вернуть новый без refresh.
 */
export async function getAccessToken(userId: string, rejected?: string): Promise<string> {
  const { clientId, clientSecret, key } = credentials();

  if (rejected === undefined) {
    const conn = await db.whoopConnection.findUnique({ where: { userId } });
    if (!conn || conn.needsReauth) throw new WhoopReauthError();
    if (conn.expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) return decryptToken(conn.accessToken, key);
  }

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"whoop:" + userId}))`;
        const conn = await tx.whoopConnection.findUnique({ where: { userId } });
        if (!conn || conn.needsReauth) throw new WhoopReauthError();

        const current = decryptToken(conn.accessToken, key);
        const fresh = conn.expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS;
        if (fresh && current !== rejected) return current;

        let next: WhoopTokenSet;
        try {
          next = await postToken({
            grant_type: "refresh_token",
            refresh_token: decryptToken(conn.refreshToken, key),
            client_id: clientId,
            client_secret: clientSecret,
            scope: "offline",
          });
        } catch (e) {
          if (e instanceof WhoopReauthError) throw new RefreshRejected();
          throw e;
        }

        await tx.whoopConnection.update({
          where: { userId },
          data: {
            accessToken: encryptToken(next.accessToken, key),
            refreshToken: encryptToken(next.refreshToken, key),
            expiresAt: next.expiresAt,
          },
        });
        return next.accessToken;
      },
      // ожидание блокировки + запрос к WHOOP (таймаут 10 с) не должны упереться в 5 с по умолчанию
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (e) {
    if (e instanceof RefreshRejected) {
      await db.whoopConnection.updateMany({ where: { userId }, data: { needsReauth: true } });
      throw new WhoopReauthError();
    }
    throw e;
  }
}
