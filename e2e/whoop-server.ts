import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WhoopApiWorkout } from "../lib/whoop/types";

/**
 * Фейковый WHOOP для e2e — третий webServer в playwright.config.ts (порт 3125, HTTP); `WHOOP_API_URL` сервера — сюда.
 * OAuth: GET /oauth/oauth2/auth сразу редиректит обратно с `code`; POST /oauth/oauth2/token — коды и refresh-ротация
 * (старые refresh и access недействительны сразу, `expires_in` всегда 1 — каждый запрос приложения идёт через refresh).
 * API (под /developer): GET /v2/user/profile/basic, GET /v2/activity/workout (пересечение с [start, end), по убыванию
 * start, limit, nextToken = смещение), GET /v2/activity/workout/:id, DELETE /v2/user/access. Неверный access → 401.
 * Служебные: POST /__control/reuse-next?user= (следующая авторизация — этот user_id; глобально, поэтому спека serial),
 * PUT /__control/workouts?user= (тело — массив активностей, заменяет), GET /__control/revoked?user=, GET /health.
 */
export const WHOOP_FAKE_PORT = 3125;
export const WHOOP_FAKE_URL = `http://localhost:${WHOOP_FAKE_PORT}`;

if (process.argv[1]?.endsWith("whoop-server.ts")) {
  /** Новые user_id: от времени запуска — база e2e переживает прогоны, а `whoopUserId` уникален. */
  let nextUserId = Date.now();
  let reuseNext: number | null = null;
  const codes = new Map<string, number>();
  const accessTokens = new Map<string, { user: number; refresh: string }>();
  const refreshTokens = new Map<string, { user: number; access: string }>();
  const workouts = new Map<number, WhoopApiWorkout[]>();
  const revoked = new Set<number>();

  const issue = (user: number) => {
    const access = `acc-${randomUUID()}`;
    const refresh = `ref-${randomUUID()}`;
    accessTokens.set(access, { user, refresh });
    refreshTokens.set(refresh, { user, access });
    return { access_token: access, refresh_token: refresh, expires_in: 1, scope: "read:workout read:profile offline", token_type: "bearer" };
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => resolve(raw));
    });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", WHOOP_FAKE_URL);
    const json = (status: number, body?: unknown) => {
      res.writeHead(status, body === undefined ? {} : { "content-type": "application/json" });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const userParam = () => Number(url.searchParams.get("user"));
    const path = url.pathname;

    if (req.method === "GET" && path === "/health") return json(200, { ok: true });

    // --- служебные ---
    if (req.method === "POST" && path === "/__control/reuse-next") {
      reuseNext = userParam();
      return json(200, { ok: true });
    }
    if (req.method === "PUT" && path === "/__control/workouts") {
      workouts.set(userParam(), JSON.parse((await readBody(req)) || "[]") as WhoopApiWorkout[]);
      return json(200, { ok: true });
    }
    if (req.method === "GET" && path === "/__control/revoked") return json(200, { revoked: revoked.has(userParam()) });

    // --- OAuth ---
    if (req.method === "GET" && path === "/oauth/oauth2/auth") {
      const redirect = url.searchParams.get("redirect_uri");
      if (!redirect) return json(400, { error: "invalid_request" });
      const code = randomUUID();
      codes.set(code, reuseNext ?? nextUserId++);
      reuseNext = null;
      const back = new URL(redirect);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (req.method === "POST" && path === "/oauth/oauth2/token") {
      const form = new URLSearchParams(await readBody(req));
      if (form.get("grant_type") === "authorization_code") {
        const user = codes.get(form.get("code") ?? "");
        if (user === undefined) return json(400, { error: "invalid_grant" });
        codes.delete(form.get("code")!);
        return json(200, issue(user));
      }
      if (form.get("grant_type") === "refresh_token") {
        const old = refreshTokens.get(form.get("refresh_token") ?? "");
        if (!old) return json(400, { error: "invalid_grant" });
        refreshTokens.delete(form.get("refresh_token")!);
        accessTokens.delete(old.access);
        return json(200, issue(old.user));
      }
      return json(400, { error: "unsupported_grant_type" });
    }

    // --- API ---
    if (!path.startsWith("/developer/v2/")) return json(404, { error: "not found" });
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
    const token = accessTokens.get(bearer);
    if (!token) return json(401, { error: "unauthorized" });
    const api = path.slice("/developer".length);

    if (req.method === "GET" && api === "/v2/user/profile/basic") {
      return json(200, { user_id: token.user, email: `whoop${token.user}@test.local`, first_name: "E2E", last_name: "Whoop" });
    }
    if (req.method === "DELETE" && api === "/v2/user/access") {
      revoked.add(token.user);
      accessTokens.delete(bearer);
      refreshTokens.delete(token.refresh);
      return json(204);
    }
    if (req.method === "GET" && api === "/v2/activity/workout") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const from = start ? Date.parse(start) : -Infinity;
      const to = end ? Date.parse(end) : Infinity;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 10) || 10, 25);
      const offset = Number(url.searchParams.get("nextToken") ?? 0) || 0;
      const list = (workouts.get(token.user) ?? [])
        .filter((w) => Date.parse(w.start) < to && Date.parse(w.end) > from)
        .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
      const records = list.slice(offset, offset + limit);
      const next = offset + limit < list.length ? String(offset + limit) : null;
      return json(200, { records, next_token: next });
    }
    const one = /^\/v2\/activity\/workout\/([^/]+)$/.exec(api);
    if (req.method === "GET" && one) {
      const w = (workouts.get(token.user) ?? []).find((x) => x.id === decodeURIComponent(one[1]));
      return w ? json(200, w) : json(404, { error: "not found" });
    }
    return json(404, { error: "not found" });
  };

  createServer((req, res) => {
    handle(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  }).listen(WHOOP_FAKE_PORT);
}
