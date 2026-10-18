import type { ClubStatus } from "@/generated/prisma/enums";
import type { RecapData } from "@/lib/recap/types";
import { nicknameKey } from "@/lib/social/league";

/** Удаление аккаунта и выгрузка (спека 2026-10-13-account-data-design) — чистые правила. */

export const DELETED_PLAYER = "Удалённый игрок";

export type DeletionInput = {
  /** Гильдия, где я глава; наследник — ник самого давнего участника (кроме меня). */
  guild: { name: string; heir: string | null } | null;
  /** Клубы, где я админ; наследник — ник самого давнего участника (кроме меня). */
  clubs: { name: string; status: ClubStatus; heir: string | null }[];
};

/** Что перейдёт другим или удалится вместе с аккаунтом — строки для диалога. */
export function deletionPreview(input: DeletionInput): string[] {
  const lines: string[] = [];
  if (input.guild) {
    lines.push(input.guild.heir ? `Гильдия «${input.guild.name}» перейдёт к ${input.guild.heir}` : `Гильдия «${input.guild.name}» будет удалена — в ней никого`);
  }
  for (const c of input.clubs) {
    if (c.status === "PENDING" || c.status === "REJECTED") lines.push(`Заявка на клуб «${c.name}» будет удалена`);
    else lines.push(c.heir ? `Клуб «${c.name}» перейдёт к ${c.heir}` : `Клуб «${c.name}» будет удалён — в нём никого`);
  }
  return lines;
}

/**
 * Имя копии чужого упражнения при переносе: unique(userId, name) действует и на архивные, а приложение сравнивает
 * имена без учёта регистра — занятое получает первый свободный номер «Присед (2)».
 */
export function freeExerciseName(name: string, taken: string[]): string {
  const keys = new Set(taken.map((t) => t.toLowerCase()));
  if (!keys.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) if (!keys.has(`${name} (${n})`.toLowerCase())) return `${name} (${n})`;
}

/** Снимок итогов недели друга: строка лиги с ником удалённого — «Удалённый игрок». Без совпадений — тот же объект. */
export function scrubRecapLeague(data: RecapData, nickname: string): { data: RecapData; changed: boolean } {
  const league = data.league;
  if (!league || !("rows" in league)) return { data, changed: false };
  const key = nicknameKey(nickname);
  if (!league.rows.some((r) => nicknameKey(r.nickname) === key)) return { data, changed: false };
  const rows = league.rows.map((r) => (nicknameKey(r.nickname) === key ? { ...r, nickname: DELETED_PLAYER } : r));
  return { data: { ...data, league: { ...league, rows } }, changed: true };
}
