import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enabledKeys, flagOn, type FlagState } from "@/lib/flags/eval";
import type { FlagKey } from "@/lib/flags/registry";

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
