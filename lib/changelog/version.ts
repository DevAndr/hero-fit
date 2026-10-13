/** Версия приложения — SemVer из package.json: релиз — minor, hotfix — patch (чек-лист в CLAUDE.md). */
export const SEMVER = /^\d+\.\d+\.\d+$/;

/** Сравнение версий X.Y.Z по числам: < 0 — a старше, 0 — равны, > 0 — a новее. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Версия сборки (next.config.ts): «v0.5.0 · a1b2c3d»; sha — из CI, локально — без него. */
export function buildLabel(version: string | undefined, sha: string | undefined): string {
  const v = `v${version ?? "0.0.0"}`;
  return sha && sha !== "dev" ? `${v} · ${sha}` : v;
}
