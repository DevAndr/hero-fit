import { BOSSES, type BossCode } from "@/lib/boss/bosses";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";

/**
 * Титулы рядом с ником. Доступность вычисляется из побед над боссами (`BossWeek`) и ачивок —
 * нигде не хранится; у пользователя хранится только выбор `User.titleCode`.
 * Коды: `boss:<bossCode>:<звёзды>`, `legend`, `ach:<код ачивки>`. Тексты — без рода.
 */
export type Title = { code: string; label: string; source: "boss" | "achievement" };
export type BossWins = Partial<Record<BossCode, number>>;

/** Побед для 1, 2 и 3 звёзд босса. */
export const BOSS_STAR_WINS = [1, 3, 10] as const;

const BOSS_TITLE_LABELS: Record<BossCode, [string, string, string]> = {
  golem: ["Гроза Голема", "Кошмар Голема", "Железное сердце"],
  troll: ["Гроза Тролля", "Кошмар Тролля", "Ледяная кровь"],
  dragon: ["Гроза Дракона", "Кошмар Дракона", "Драконья чешуя"],
  knight: ["Гроза Рыцаря", "Кошмар Рыцаря", "Тень среди теней"],
  lich: ["Гроза Лича", "Кошмар Лича", "Костяная корона"],
  treant: ["Гроза Древня", "Кошмар Древня", "Корни гор"],
  colossus: ["Гроза Колосса", "Кошмар Колосса", "Песчаная буря"],
  crystal: ["Гроза Стража", "Кошмар Стража", "Алмазная грань"],
  storm: ["Громоотвод", "Укротитель бури", "Сердце бури"],
  queen: ["Гроза Королевы", "Кошмар Королевы", "Противоядие"],
  runes: ["Гроза Хранителя", "Кошмар Хранителя", "Рунная печать"],
  void: ["Гроза Пустоты", "Кошмар Пустоты", "Взгляд в бездну"],
};

const LEGEND: Title = { code: "legend", label: "Легенда бестиария", source: "boss" };

/** Вершины лестниц ачивок → титул (порядок — порядок в списках). */
const ACHIEVEMENT_TITLES: [achievementCode: string, label: string][] = [
  ["streakw:12", "Железная воля"],
  ["workouts:100", "Ветеран зала"],
  ["level:25", "Титан"],
  ["records:50", "Рекордсмен"],
  ["volume:100", "Тяжеловес"],
  ["league1:1", "Чемпион лиги"],
  [`allgroups:${MUSCLE_GROUPS.length}`, "Без слабых мест"],
  ["login:100", "Завсегдатай"],
];

const achievementTitle = ([code, label]: [string, string]): Title => ({ code: `ach:${code}`, label, source: "achievement" });

export function bossStars(wins: number): 0 | 1 | 2 | 3 {
  return BOSS_STAR_WINS.filter((w) => wins >= w).length as 0 | 1 | 2 | 3;
}

/** Три титула босса с порогом побед. */
export function bossTitles(code: BossCode): (Title & { wins: number })[] {
  return BOSS_TITLE_LABELS[code].map((label, i) => ({ code: `boss:${code}:${i + 1}`, label, source: "boss", wins: BOSS_STAR_WINS[i] }));
}

const hasLegend = (wins: BossWins) => BOSSES.every((b) => (wins[b.code] ?? 0) >= BOSS_STAR_WINS[0]);

export function availableTitles({ achievementCodes, bossWins }: { achievementCodes: Iterable<string>; bossWins: BossWins }): Title[] {
  const earned = new Set(achievementCodes);
  return [
    ...BOSSES.flatMap((b) => bossTitles(b.code).slice(0, bossStars(bossWins[b.code] ?? 0))).map(({ code, label, source }) => ({ code, label, source })),
    ...(hasLegend(bossWins) ? [LEGEND] : []),
    ...ACHIEVEMENT_TITLES.filter(([code]) => earned.has(code)).map(achievementTitle),
  ];
}

const ALL_TITLES = new Map<string, Title>(
  [...BOSSES.flatMap((b) => bossTitles(b.code)), LEGEND, ...ACHIEVEMENT_TITLES.map(achievementTitle)].map((t) => [t.code, t]),
);

/** Название титула по коду; неизвестный код (переименование каталога) — null. */
export function titleLabel(code: string | null | undefined): string | null {
  return (code && ALL_TITLES.get(code)?.label) || null;
}

export function titleForAchievement(achievementCode: string): Title | null {
  return ALL_TITLES.get(`ach:${achievementCode}`) ?? null;
}

/** Титулы, которые открывает одна новая победа над `code`. */
export function titlesUnlockedByWin(winsBefore: BossWins, code: BossCode): Title[] {
  const before = winsBefore[code] ?? 0;
  const after: BossWins = { ...winsBefore, [code]: before + 1 };
  const titles: Title[] = [];
  const stars = bossStars(before + 1);
  if (stars > bossStars(before)) {
    const { code: titleCode, label, source } = bossTitles(code)[stars - 1];
    titles.push({ code: titleCode, label, source });
  }
  if (!hasLegend(winsBefore) && hasLegend(after)) titles.push(LEGEND);
  return titles;
}
