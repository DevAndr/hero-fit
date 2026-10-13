import type { RecordType } from "@/generated/prisma/enums";
import { bossName } from "@/lib/boss/bosses";
import { streakMilestone, type FeedRow } from "@/lib/social/feed";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { titleLabel } from "@/lib/titles/catalog";

/**
 * Лента клуба — только события тренировок участников (спека 2026-10-12-clubs-design): незнакомцам в клубе не
 * открываются ни сама тренировка, ни её цифры. Правила событий — как в ленте друзей (`toFeedEntry`).
 */

/** Строка из БД; `id` тренировки — только для курсора на сервере. */
export type ClubFeedRow = {
  id: string;
  userId: string;
  nickname: string | null;
  titleCode: string | null;
  avatarCode?: string | null;
  frameCode?: string | null;
  nickColorCode?: string | null;
  /** Видимая косметика автора (флаг владельца учтён при чтении). */
  cosmetics?: Cosmetics;
  hideWeights: boolean;
  finishedAt: Date;
  meta: FeedRow["meta"];
};

export type ClubEvent = {
  key: string;
  nickname: string;
  title: string | null;
  cosmetics?: Cosmetics;
  me: boolean;
  finishedAt: string;
  achievements: string[];
  levelUp: number | null;
  records: { exerciseName: string; type: RecordType; value: number | null }[];
  streakMilestone: number | null;
  bossDefeated: string | null;
  goals: string[];
  /** Выполненные этой тренировкой личные задания клуба (EACH). */
  tasks: string[];
  /** Задания «всем клубом», которые эта тренировка добила. */
  clubTasks: string[];
};

const QUIET_ACHIEVEMENTS = /^login:/;
/** Силовые ачивки с весом в названии («Жим лёжа: 120 кг», «+10 кг», «×1,25 веса тела») — скрываются при hideWeights. */
const WEIGHT_ACHIEVEMENTS = /^(lift|weightkg|bwratio):/;
const WEIGHT_RECORDS: RecordType[] = ["ONE_RM", "MAX_WEIGHT"];
/** Запросов на одну подгрузку: тренировки без событий не должны обрывать ленту, но и не тянуть всю историю. */
export const CLUB_FEED_QUERIES = 3;

/** Короткий хэш id тренировки для ключа: ключи уникальны, а сам id чужой тренировки в браузер не уходит. */
function shortHash(id: string): string {
  let h = 0x811c9dc5;
  for (const ch of id) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function toClubEvents(row: ClubFeedRow, viewerId: string): ClubEvent | null {
  const me = row.userId === viewerId;
  const hide = row.hideWeights && !me;
  const meta = row.meta ?? {};
  const nickname = row.nickname ?? "—";
  const finishedAt = row.finishedAt.toISOString();
  const event: ClubEvent = {
    key: `${nickname}|${finishedAt}|${shortHash(row.id)}`,
    nickname,
    title: titleLabel(row.titleCode),
    cosmetics: row.cosmetics,
    me,
    finishedAt,
    achievements: (meta.achievements ?? [])
      .filter((a) => !QUIET_ACHIEVEMENTS.test(a.code) && !(hide && WEIGHT_ACHIEVEMENTS.test(a.code)))
      .map((a) => a.title),
    levelUp: meta.levelAfter && meta.levelBefore && meta.levelAfter > meta.levelBefore ? meta.levelAfter : null,
    records: (meta.records ?? []).map((r) => ({
      exerciseName: r.exerciseName,
      type: r.type,
      value: hide && WEIGHT_RECORDS.includes(r.type) ? null : r.value,
    })),
    streakMilestone: streakMilestone(row.meta),
    bossDefeated: meta.boss?.defeated ? bossName(meta.boss.code) : null,
    goals: (meta.goals?.achieved ?? []).filter((g) => g.type !== "BODY_WEIGHT").map((g) => (hide && g.feedTitle) || g.title),
    tasks: (meta.clubTasks ?? []).filter((t) => t.mode === "EACH" && t.completed).map((t) => (hide ? t.feedTitle : t.title)),
    clubTasks: (meta.clubTasks ?? []).filter((t) => t.clubCompleted).map((t) => (hide ? t.feedTitle : t.title)),
  };
  const empty =
    event.achievements.length === 0 &&
    event.records.length === 0 &&
    event.goals.length === 0 &&
    event.tasks.length === 0 &&
    event.clubTasks.length === 0 &&
    event.levelUp === null &&
    event.streakMilestone === null &&
    event.bossDefeated === null;
  return empty ? null : event;
}

/** Набрать страницу событий: страница строк без событий не обрывает ленту, не больше `maxQueries` запросов. */
export async function collectEvents(
  fetchPage: (cursor: string | null) => Promise<{ rows: ClubFeedRow[]; next: string | null }>,
  viewerId: string,
  cursor: string | null,
  want: number,
  maxQueries = CLUB_FEED_QUERIES,
): Promise<{ events: ClubEvent[]; next: string | null }> {
  const events: ClubEvent[] = [];
  let next = cursor;
  for (let i = 0; i < maxQueries; i++) {
    const page = await fetchPage(next);
    for (const row of page.rows) {
      const e = toClubEvents(row, viewerId);
      if (e) events.push(e);
    }
    next = page.next;
    if (!next || events.length >= want) break;
  }
  return { events, next };
}
