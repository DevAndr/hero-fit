import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enabledKeys, flagOn, type FlagState } from "@/lib/flags/eval";
import { FLAGS, FLAG_KEYS, isFlagKey, type FlagKey } from "@/lib/flags/registry";

/** Кэш на процесс (один процесс app): сохранение в админке сбрасывает его сразу, иначе — не старше FLAGS_CACHE_MS. */
let cache: { at: number; states: Map<string, FlagState> } | null = null;

export async function getFlagStates(): Promise<Map<string, FlagState>> {
  if (cache && Date.now() - cache.at < env.FLAGS_CACHE_MS) return cache.states;
  const rows = await db.featureFlag.findMany({ select: { key: true, enabled: true, percent: true, userIds: true } });
  const states = new Map(rows.map(({ key, ...s }) => [key, s]));
  cache = { at: Date.now(), states };
  return states;
}

export function invalidateFlags() {
  cache = null;
}

export async function isEnabled(key: FlagKey, userId: string | null): Promise<boolean> {
  return flagOn(key, (await getFlagStates()).get(key) ?? null, userId);
}

export async function enabledFlags(userId: string | null): Promise<FlagKey[]> {
  return enabledKeys(await getFlagStates(), userId);
}

const DAY_MS = 86_400_000;

export type FlagAdminRow = {
  key: FlagKey;
  description: string;
  expires: string;
  expired: boolean;
  state: FlagState & { updatedAt: Date | null; updatedBy: string | null };
  users: { id: string; label: string }[];
  /** Оценка охвата: активные за 28 дней × процент + список; выключен — 0. */
  reach: number;
};

/** Данные /admin/flags: флаги реестра с состоянием и строки БД не из реестра (устаревшие). */
export async function getFlagsAdmin(now = new Date()): Promise<{ flags: FlagAdminRow[]; stale: string[] }> {
  const [rows, active] = await Promise.all([
    db.featureFlag.findMany(),
    db.workout
      .groupBy({ by: ["userId"], where: { status: "COMPLETED", finishedAt: { gte: new Date(now.getTime() - 28 * DAY_MS) } } })
      .then((g) => g.length),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const userIds = [...new Set(rows.flatMap((r) => r.userIds))];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, login: true, nickname: true } });
  const label = new Map(users.map((u) => [u.id, u.nickname ?? u.login]));
  const today = now.toISOString().slice(0, 10);

  const flags = FLAG_KEYS.map((key) => {
    const r = byKey.get(key);
    const state = {
      enabled: r?.enabled ?? false,
      percent: r?.percent ?? 0,
      userIds: r?.userIds ?? [],
      updatedAt: r?.updatedAt ?? null,
      updatedBy: r?.updatedBy ?? null,
    };
    return {
      key,
      description: FLAGS[key].description,
      expires: FLAGS[key].expires,
      expired: FLAGS[key].expires < today,
      state,
      users: state.userIds.map((id) => ({ id, label: label.get(id) ?? "удалённый пользователь" })),
      reach: state.enabled ? Math.round((active * state.percent) / 100) + state.userIds.length : 0,
    };
  });
  return { flags, stale: rows.map((r) => r.key).filter((k) => !isFlagKey(k)) };
}
