import type { FinishMeta } from "@/lib/workouts/finish";

/**
 * meta события завершения, пригодная для итогов недели. В базе встречается и пустая `{}` (ручные правки, старые
 * записи) — без проверки сборка итогов падала на `records`, и пользователь оставался без итогов недели.
 */
export function isFinishMeta(m: unknown): m is FinishMeta {
  if (!m || typeof m !== "object") return false;
  const meta = m as Partial<FinishMeta>;
  return Array.isArray(meta.records) && typeof meta.weekCount === "number";
}
