import { dayKey } from "@/lib/daily-login";
import { formatDuration } from "@/lib/format";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { GroupRecovery } from "@/lib/progress/recovery";

export type SleepNight = {
  end: Date;
  sleepScoreState: string;
  sleepMs: number | null;
  needMs: number | null;
  performancePct: number | null;
  recoveryScoreState: string | null;
  recoveryPct: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  calibrating: boolean;
};

export type RecoveryZone = "green" | "yellow" | "red";

export function recoveryZone(pct: number | null): RecoveryZone | null {
  if (pct === null) return null;
  if (pct >= 67) return "green";
  if (pct >= 34) return "yellow";
  return "red";
}

function latestOnDay(nights: SleepNight[], day: string, now: Date, timeZone: string) {
  let best: SleepNight | null = null;
  for (const n of nights) {
    if (n.end.getTime() > now.getTime()) continue;
    if (dayKey(n.end, timeZone) !== day) continue;
    if (!best || n.end.getTime() > best.end.getTime()) best = n;
  }
  return best;
}

export function todaySleep(nights: SleepNight[], now: Date, timeZone: string): SleepNight | null {
  return latestOnDay(nights, dayKey(now, timeZone), now, timeZone);
}

export function yesterdaySleep(nights: SleepNight[], now: Date, timeZone: string): SleepNight | null {
  const d = new Date(`${dayKey(now, timeZone)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return latestOnDay(nights, d.toISOString().slice(0, 10), now, timeZone);
}

export function baseline(nights: SleepNight[], today: SleepNight): { hrvMs: number; restingHr: number } | null {
  const prev = nights
    .filter(
      (n) =>
        n.end.getTime() < today.end.getTime() &&
        n.recoveryScoreState === "SCORED" &&
        n.hrvMs !== null &&
        n.restingHr !== null,
    )
    .sort((a, b) => b.end.getTime() - a.end.getTime())
    .slice(0, 7);
  if (prev.length < 4) return null;
  const avg = (f: (n: SleepNight) => number | null) => prev.reduce((s, n) => s + (f(n) ?? 0), 0) / prev.length;
  return { hrvMs: avg((n) => n.hrvMs), restingHr: avg((n) => n.restingHr) };
}

export function zoneText(zone: RecoveryZone): string {
  switch (zone) {
    case "green":
      return "Зелёная зона — можно тяжёлую тренировку";
    case "yellow":
      return "Восстановление среднее — держи текущие веса";
    case "red":
      return "Лёгкий день: −10 % веса или на подход меньше";
  }
}

/** Группы, чья метка стоит во множественном числе («Ноги», «Плечи»…). */
const PLURAL_LABEL_GROUPS = new Set<string>(["LEGS", "SHOULDERS", "FOREARMS", "CALVES"]);

export type Advice = {
  id: "rhr" | "hrv" | "sleep" | "muscles" | "good-day";
  tone: "warn" | "good";
  text: string;
  href?: string;
};

function underslept(n: SleepNight) {
  return n.sleepMs !== null && n.needMs !== null && n.needMs > 0 && n.sleepMs < 0.7 * n.needMs;
}

export function whoopAdvice(input: {
  today: SleepNight;
  yesterday: SleepNight | null;
  base: { hrvMs: number; restingHr: number } | null;
  muscles: GroupRecovery[];
}): Advice[] {
  const { today, yesterday, base, muscles } = input;
  const out: Advice[] = [];
  const useBase = base !== null && !today.calibrating;

  if (useBase && today.restingHr !== null && today.restingHr - base.restingHr >= 5) {
    const diff = Math.round(today.restingHr - base.restingHr);
    out.push({
      id: "rhr",
      tone: "warn",
      text: `Пульс покоя выше обычного на ${diff} — бывает при усталости или начале простуды, не форсируй`,
    });
  }
  if (useBase && today.hrvMs !== null && today.hrvMs <= 0.85 * base.hrvMs) {
    out.push({ id: "hrv", tone: "warn", text: "HRV ниже твоей нормы — организм ещё под нагрузкой" });
  }
  if (underslept(today)) {
    const text =
      yesterday && underslept(yesterday)
        ? "Второй день недосыпа — лучше лечь пораньше"
        : `Недоспал ${formatDuration((today.needMs! - today.sleepMs!) / 1000)} — сократи тренировку и отдыхай дольше между подходами`;
    out.push({ id: "sleep", tone: "warn", text });
  }
  const zone = recoveryZone(today.recoveryPct);
  if (zone === "yellow" || zone === "red") {
    const tired = muscles.filter((m) => m.state === "fatigued").slice(0, 2);
    const names = tired.map((m) => MUSCLE_GROUP_LABELS[m.group]);
    if (names.length) {
      const verb = tired.length === 1 && !PLURAL_LABEL_GROUPS.has(tired[0].group) ? "восстанавливается" : "восстанавливаются";
      const list = names.map((n, i) => (i === 0 ? n : n.toLowerCase())).join(", ");
      out.push({
        id: "muscles",
        tone: "warn",
        text: `${list} ещё ${verb} — сегодня лучше другие группы мышц`,
      });
    }
  }
  if (
    out.length === 0 &&
    zone === "green" &&
    (today.performancePct ?? 0) >= 90 &&
    base !== null &&
    today.hrvMs !== null &&
    today.hrvMs > base.hrvMs
  ) {
    out.push({
      id: "good-day",
      tone: "good",
      text: "Отличное восстановление — хороший день для рекорда",
      href: "/training",
    });
  }
  return out;
}
