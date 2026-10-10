import { createServer } from "node:http";

/**
 * Фейковый Bot API для e2e — второй webServer в playwright.config.ts (порт 3124, HTTP).
 * POST /bot<токен>/<метод> записывает вызов; чаты из /block отвечают 403, как заблокировавший бота пользователь.
 * Служебные: GET /calls?chat_id= — вызовы этого чата, POST /block?chat_id=, GET /health.
 */
export const TELEGRAM_FAKE_PORT = 3124;
export const TELEGRAM_FAKE_URL = `http://localhost:${TELEGRAM_FAKE_PORT}`;

type Call = { method: string; params: Record<string, unknown> };

if (process.argv[1]?.endsWith("telegram-server.ts")) {
  const calls: Call[] = [];
  const blocked = new Set<string>();
  let messageId = 0;

  createServer((req, res) => {
    const url = new URL(req.url ?? "/", TELEGRAM_FAKE_URL);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/health") return json(200, { ok: true });
    if (req.method === "GET" && url.pathname === "/calls") {
      const chat = url.searchParams.get("chat_id");
      return json(200, calls.filter((c) => String(c.params.chat_id) === chat));
    }
    if (req.method === "POST" && url.pathname === "/block") {
      blocked.add(url.searchParams.get("chat_id") ?? "");
      return json(200, { ok: true });
    }
    const match = /^\/bot[^/]+\/(\w+)$/.exec(url.pathname);
    if (req.method !== "POST" || !match) return json(404, { ok: false, error_code: 404, description: "Not Found" });

    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const params = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      calls.push({ method: match[1], params });
      if (params.chat_id !== undefined && blocked.has(String(params.chat_id))) {
        return json(403, { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
      }
      json(200, { ok: true, result: match[1] === "sendMessage" ? { message_id: ++messageId } : true });
    });
  }).listen(TELEGRAM_FAKE_PORT);
}
