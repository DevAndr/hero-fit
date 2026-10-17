import "server-only";
import { apiUrl } from "./config";
import { getAccessToken, WhoopReauthError, WhoopUnavailableError } from "./tokens";

const TIMEOUT_MS = 10_000;

/** fetch к API WHOOP с таймаутом 10 с; сетевая ошибка/таймаут → WhoopUnavailableError (без подробностей). */
async function call(url: string, accessToken: string, method: "GET" | "DELETE" = "GET"): Promise<Response> {
  try {
    return await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new WhoopUnavailableError("whoop request failed");
  }
}

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new WhoopUnavailableError("whoop response invalid");
  }
}

/** user_id WHOOP (int64) строкой — по токену, ещё до записи подключения (callback OAuth). */
export async function fetchProfileUserId(accessToken: string): Promise<string> {
  const res = await call(apiUrl("/v2/user/profile/basic"), accessToken);
  if (res.status === 401) throw new WhoopReauthError(`whoop ${res.status}`);
  if (!res.ok) throw new WhoopUnavailableError(`whoop ${res.status}`);
  const body = await readJson<{ user_id?: unknown }>(res);
  if (typeof body.user_id !== "number" && typeof body.user_id !== "string") {
    throw new WhoopUnavailableError("whoop response invalid");
  }
  return String(body.user_id);
}

/**
 * GET к API WHOOP от имени пользователя. 404 → null; 401 → один повтор после принудительного refresh;
 * 429/5xx/прочие ошибки/таймаут → WhoopUnavailableError; нет подключения или refresh отклонён → WhoopReauthError.
 */
export async function whoopGet<T>(userId: string, path: string, query?: Record<string, string>): Promise<T | null> {
  const url = apiUrl(path) + (query ? `?${new URLSearchParams(query).toString()}` : "");

  let token = await getAccessToken(userId);
  let res = await call(url, token);
  if (res.status === 401) {
    token = await getAccessToken(userId, token);
    res = await call(url, token);
  }

  if (res.status === 404) return null;
  if (!res.ok) throw new WhoopUnavailableError(`whoop ${res.status}`);
  return readJson<T>(res);
}

/** Отзыв доступа по токену (`DELETE /v2/user/access`), заодно прекращает вебхуки. Ошибки глотаются. */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await call(apiUrl("/v2/user/access"), accessToken, "DELETE");
  } catch {
    // данные у нас удаляются в любом случае
  }
}

/** Отзыв доступа пользователя (отключение WHOOP). Любые ошибки глотаются. */
export async function revokeAccess(userId: string): Promise<void> {
  let token: string;
  try {
    token = await getAccessToken(userId);
  } catch {
    return;
  }
  await revokeToken(token);
}
