/** Запрашиваемые scope WHOOP (через пробел). Без server-only — используется и в клиентских компонентах. */
export const WHOOP_SCOPES = "read:workout read:profile read:recovery read:sleep offline";
/** Scope подключений, созданных до сна и восстановления. */
export const WHOOP_LEGACY_SCOPES = "read:workout read:profile offline";

/** Есть ли scope среди выданных (строка через пробел; сравнение по целому слову). */
export function hasScope(scopes: string, scope: string): boolean {
  return scopes.split(/\s+/).includes(scope);
}
