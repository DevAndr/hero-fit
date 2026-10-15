/**
 * «Все данные» (JSON) — выгрузка по 152-ФЗ. Профиль собирается по белому списку: хэш пароля, Telegram id, токены сюда
 * не попадают, даже если пришли в выборке; о других людях — только ники.
 */

import { itemByCode } from "@/lib/shop/catalog";

type Dated = Date | null;

export type ExportWorkout = {
  name: string;
  status: string;
  startedAt: Dated;
  finishedAt: Dated;
  durationSec: number | null;
  totalVolume: number;
  rpe: number | null;
  notes: string | null;
  wellbeing: string | null;
  exercises: { name: string; supersetGroup?: number | null; sets: { weight: number; reps: number; rir: number | null; isWarmup: boolean; completedAt: Dated }[] }[];
};

export type ExportRaw = {
  /** Строка пользователя — может содержать и секреты: профиль берёт только PROFILE_FIELDS и notify*. */
  user: Record<string, unknown> & { telegramChatId?: unknown; telegramId?: unknown };
  workouts: ExportWorkout[];
  /** Люди — могут прийти с лишними полями (id, логин): в выгрузку идут только ник и даты. */
  friends: ({ nickname: string | null; status: string; since: Dated } & Record<string, unknown>)[];
  coach: ({ nickname: string | null; since: Dated; until: Dated } & Record<string, unknown>)[];
  clients: ({ nickname: string | null; since: Dated; until: Dated } & Record<string, unknown>)[];
  exercises: unknown[];
  templates: unknown[];
  plans: unknown[];
  goals: unknown[];
  bodyWeight: unknown[];
  records: unknown[];
  achievements: unknown[];
  xpHistory: unknown[];
  recaps: unknown[];
  boss: unknown[];
  goblins: unknown[];
  raids: unknown[];
  guild: unknown;
  club: unknown;
  coachComments: unknown[];
  notifications: unknown[];
  shop: {
    coins: number;
    items: { code: string; acquiredAt: Date }[];
    coinHistory: ({ amount: number; reason: string; createdAt: Date } & Record<string, unknown>)[];
  };
};

export const EXPORT_SECTIONS = [
  "profile",
  "workouts",
  "exercises",
  "templates",
  "plans",
  "goals",
  "bodyWeight",
  "records",
  "achievements",
  "xpHistory",
  "recaps",
  "boss",
  "goblins",
  "raids",
  "friends",
  "guild",
  "club",
  "coach",
  "clients",
  "coachComments",
  "notifications",
  "shop",
] as const;

const PROFILE_FIELDS = [
  "login",
  "email",
  "name",
  "nickname",
  "timeZone",
  "createdAt",
  "privacyAcceptedAt",
  "xp",
  "level",
  "currentStreak",
  "longestStreak",
  "hideWeights",
  "shareActivity",
] as const;

const people = <T extends { nickname: string | null }>(list: T[], keys: (keyof T)[]) =>
  list.map((p) => Object.fromEntries(keys.map((k) => [k, p[k]])) as Pick<T, (typeof keys)[number]>);

export function buildExport(raw: ExportRaw, exportedAt: Date) {
  const u = raw.user;
  const notifications = Object.fromEntries(Object.entries(u).filter(([k, v]) => /^notify[A-Z]/.test(k) && typeof v === "boolean"));
  return {
    version: 1 as const,
    exportedAt,
    profile: { ...Object.fromEntries(PROFILE_FIELDS.map((k) => [k, u[k] ?? null])), notifications, telegramLinked: u.telegramChatId != null || u.telegramId != null },
    workouts: raw.workouts.map((w) => ({
      name: w.name,
      status: w.status,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      durationSec: w.durationSec,
      totalVolume: w.totalVolume,
      rpe: w.rpe,
      notes: w.notes,
      wellbeing: w.wellbeing,
      exercises: w.exercises.map((e) => ({
        name: e.name,
        superset: e.supersetGroup ?? null,
        sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir, warmup: s.isWarmup, done: s.completedAt !== null })),
      })),
    })),
    exercises: raw.exercises,
    templates: raw.templates,
    plans: raw.plans,
    goals: raw.goals,
    bodyWeight: raw.bodyWeight,
    records: raw.records,
    achievements: raw.achievements,
    xpHistory: raw.xpHistory,
    recaps: raw.recaps,
    boss: raw.boss,
    goblins: raw.goblins,
    raids: raw.raids,
    friends: people(raw.friends, ["nickname", "status", "since"]),
    guild: raw.guild,
    club: raw.club,
    coach: people(raw.coach, ["nickname", "since", "until"]),
    clients: people(raw.clients, ["nickname", "since", "until"]),
    coachComments: raw.coachComments,
    notifications: raw.notifications,
    shop: {
      coins: raw.shop.coins,
      items: raw.shop.items.map((i) => ({ code: i.code, name: itemByCode(i.code)?.name ?? i.code, acquiredAt: i.acquiredAt })),
      coinHistory: raw.shop.coinHistory.map((c) => ({ amount: c.amount, reason: c.reason, createdAt: c.createdAt })),
    },
  };
}

export type ExportV1 = ReturnType<typeof buildExport>;
