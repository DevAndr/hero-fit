/** Экскурсия по дашборду: шаги и переходы (чистые функции). Элементы ищутся по атрибуту `data-tour`. */

export type TourTarget = "xp" | "streak" | "boss" | "body-map" | "nav";
export type TourStepId = "welcome" | TourTarget | "first-workout";
export type TourStep = { id: TourStepId; target?: TourTarget; title: string; text: string };

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Добро пожаловать в Hero Fit",
    text: "Здесь каждая тренировка приносит опыт, уровни и награды. Покажем главное за минуту.",
  },
  {
    id: "xp",
    target: "xp",
    title: "Уровень и опыт",
    text: "Опыт начисляется за подходы, повторы, поднятый объём и личные рекорды. Чем больше реальной работы — тем выше уровень.",
  },
  {
    id: "streak",
    target: "streak",
    title: "Недельный streak",
    text: "3 тренировки за неделю — и серия растёт. Пропустить неделю без потери серии помогут заморозки.",
  },
  {
    id: "boss",
    target: "boss",
    title: "Босс недели",
    text: "Каждый подход снимает боссу HP, подход до отказа бьёт сильнее, а рекорд — критический удар. Победа открывает сундук с опытом.",
  },
  {
    id: "body-map",
    target: "body-map",
    title: "Карта мышц",
    text: "Видно, какие мышцы ещё восстанавливаются, а какие можно нагружать сегодня.",
  },
  {
    id: "nav",
    target: "nav",
    title: "Разделы",
    text: "Упражнения, календарь, статистика, друзья и ачивки — всё в меню.",
  },
  {
    id: "first-workout",
    title: "Первая тренировка",
    text: "Выбери готовую программу — тренировка откроется сразу с упражнениями.",
  },
];

const LAST = TOUR_STEPS.length - 1;

/** Первый и последний шаги — без привязки, доступны всегда. */
function isOpen(i: number, available: (s: TourStep) => boolean) {
  return i === 0 || i === LAST || available(TOUR_STEPS[i]);
}

export function nextStep(i: number, available: (s: TourStep) => boolean): number {
  for (let j = i + 1; j <= LAST; j++) if (isOpen(j, available)) return j;
  return i;
}

export function prevStep(i: number, available: (s: TourStep) => boolean): number {
  for (let j = i - 1; j >= 0; j--) if (isOpen(j, available)) return j;
  return i;
}

/** Номер шага для счётчика «3 / 7» — среди доступных. */
export function stepNumber(i: number, available: (s: TourStep) => boolean): { current: number; total: number } {
  const open = TOUR_STEPS.map((_, j) => j).filter((j) => isOpen(j, available));
  return { current: open.indexOf(i) + 1, total: open.length };
}

/** Ежедневный сундук не открывается сам, пока идёт экскурсия. */
export function chestAutoOpen(envOn: boolean, onboardedAt: Date | null): boolean {
  return envOn && onboardedAt !== null;
}
