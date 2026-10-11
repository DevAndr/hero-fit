/** Рейд-босс гильдии — чистые правила (спека: docs/superpowers/specs/2026-10-11-raid-boss-design.md). */
import { bossForWeek, bossName, type BossCode } from "@/lib/boss/bosses";
import { dayKey } from "@/lib/daily-login";
import { addWeeks, localHour, localMidnight, weekKey } from "@/lib/progress/weekly-streak";

/** Доля HP участника без урона за 4 прошлые недели (новичок или давно не тренировался). */
export const RAID_IDLE_SHARE = 1000;
export const RAID_MIN_HP = 1500;
export const RAID_HP_FACTOR = 1.2;
export const RAID_REWARD_CAP = 400;
/** Сколько недель после победы можно открыть сундук. */
export const RAID_CHEST_WEEKS = 4;
/** Напоминание «не хватает урона» — в четверг с этого часа (пояс главы). */
export const RAID_REMINDER_HOUR = 12;
/** Сколько прошлых недель смотрим для доли участника. */
export const RAID_HISTORY_WEEKS = 4;
/** Сдвиг ротации относительно личного босса — в ту же неделю они не совпадают. */
const ROTATION_SHIFT = 6;
const DAY_MS = 24 * 3_600_000;

export function raidBossForWeek(week: string): BossCode {
  return bossForWeek(addWeeks(week, ROTATION_SHIFT));
}

export function raidBossName(code: string): string {
  return `Древний ${bossName(code)}`;
}

/** Доля участника: средний урон по неделям с уроном среди прошлых недель, иначе — базовая. */
export function memberShare(pastWeekly: number[]): number {
  const weeks = pastWeekly.filter((d) => d > 0);
  if (!weeks.length) return RAID_IDLE_SHARE;
  return weeks.reduce((a, b) => a + b, 0) / weeks.length;
}

export function raidHp(shares: number[]): number {
  const sum = shares.reduce((a, b) => a + b, 0);
  return Math.max(RAID_MIN_HP, Math.round((sum * RAID_HP_FACTOR) / 100) * 100);
}

/** Награда из сундука: поровну на бивших (с потолком), MVP — × 1,5. */
export function raidRewardXp(hp: number, hitters: number, mvp: boolean): number {
  const base = Math.min(RAID_REWARD_CAP, Math.round(hp / Math.max(1, hitters) / 20));
  return mvp ? Math.round(base * 1.5) : base;
}

/** Тренировка бьёт рейд: завершена в окне недели и не раньше вступления. */
export function hitCounts(a: { finishedAt: Date; joinedAt: Date; startsAt: Date; endsAt: Date }): boolean {
  const t = a.finishedAt.getTime();
  return t >= a.startsAt.getTime() && t < a.endsAt.getTime() && t >= a.joinedAt.getTime();
}

/** MVP — наибольший суммарный урон; при равенстве — у кого раньше первый удар. */
export function pickMvp(hits: { userId: string; damage: number; createdAt: Date }[]): string | null {
  const totals = new Map<string, { damage: number; first: number }>();
  for (const h of hits) {
    const t = totals.get(h.userId) ?? { damage: 0, first: Infinity };
    t.damage += h.damage;
    t.first = Math.min(t.first, h.createdAt.getTime());
    totals.set(h.userId, t);
  }
  let best: [string, { damage: number; first: number }] | null = null;
  for (const entry of totals) {
    if (!best || entry[1].damage > best[1].damage || (entry[1].damage === best[1].damage && entry[1].first < best[1].first)) best = entry;
  }
  return best?.[0] ?? null;
}

export function chestOpenable(defeatedAt: Date, now: Date): boolean {
  return now.getTime() < defeatedAt.getTime() + RAID_CHEST_WEEKS * 7 * DAY_MS;
}

/** Пора напомнить: не повержен, не отправляли, четверг недели рейда с 12:00 в поясе tz (только четверг — в тексте «4 дня»). */
export function raidReminderDue(a: { now: Date; tz: string; startsAt: Date; defeated: boolean; notified: boolean }): boolean {
  if (a.defeated || a.notified) return false;
  // Середина четверга недели рейда → его календарный день
  const thursday = dayKey(new Date(localMidnight(weekKey(a.startsAt, a.tz), a.tz).getTime() + 3.5 * DAY_MS), a.tz);
  const today = dayKey(a.now, a.tz);
  return today === thursday && localHour(a.now, a.tz) >= RAID_REMINDER_HOUR;
}

export function raidReminderText(left: number): { title: string; body: string } {
  return { title: "Рейд-босс ещё стоит", body: `Гильдии не хватает ${left} урона — до конца рейда 4 дня` };
}
