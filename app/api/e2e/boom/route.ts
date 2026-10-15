/** Только для e2e (E2E_ERROR_ROUTE=1): серверная ошибка в route handler; иначе 404. */
export async function GET(req: Request) {
  if (process.env.E2E_ERROR_ROUTE !== "1") return new Response(null, { status: 404 });
  const tag = new URL(req.url).searchParams.get("tag") ?? "";
  throw new Error(`e2e server boom ${tag}`);
}
