import { notFound } from "next/navigation";

/** Только для e2e (E2E_ERROR_ROUTE=1): страница падает при рендере — проверка границы ошибок; иначе 404. */
export default async function E2eBoomPage({ searchParams }: PageProps<"/e2e-boom">) {
  if (process.env.E2E_ERROR_ROUTE !== "1") notFound();
  const { tag } = await searchParams;
  throw new Error(`e2e page boom ${typeof tag === "string" ? tag : ""}`);
}
