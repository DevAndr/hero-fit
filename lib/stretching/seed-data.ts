import type { StretchZone } from "@/generated/prisma/enums";
import type { StretchSkillKey } from "./skills";

// Встроенная растяжка и готовые программы — единый источник для сида (prisma/seed.ts) и теста.
// Имена — ключ поиска в БД (userId = null): менять нельзя, иначе на проде появятся дубли.

export type StretchSeed = { name: string; zones: StretchZone[]; perSide?: boolean; restSec: 15 };

const s = (name: string, zones: StretchZone[], perSide?: boolean): StretchSeed => ({
  name,
  zones,
  ...(perSide ? { perSide } : {}),
  restSec: 15,
});

export const STRETCH_SEED: StretchSeed[] = [
  s("Наклоны головы в стороны", ["NECK"], true),
  s("Наклон головы вперёд", ["NECK", "BACK"]),
  s("Растяжка плеча у груди", ["SHOULDERS"], true),
  s("Растяжка плеча за головой", ["SHOULDERS"], true),
  s("Растяжка груди в проёме", ["CHEST", "SHOULDERS"]),
  s("Растяжка груди с руками за спиной", ["CHEST"]),
  s("Кошка-корова", ["BACK", "LOWER_BACK"]),
  s("Поза ребёнка", ["BACK", "LOWER_BACK"]),
  s("Скручивание лёжа", ["BACK", "LOWER_BACK"], true),
  s("Кобра", ["LOWER_BACK", "CHEST"]),
  s("Колени к груди лёжа", ["LOWER_BACK", "HIPS"]),
  s("Голубь", ["HIPS"], true),
  s("Выпад на сгибатели бедра", ["HIPS", "QUADS"], true),
  s("Складка стоя", ["HAMSTRINGS", "BACK"]),
  s("Складка сидя", ["HAMSTRINGS", "BACK"]),
  s("Растяжка задней поверхности бедра лёжа", ["HAMSTRINGS"], true),
  s("Растяжка квадрицепса стоя", ["QUADS"], true),
  s("Растяжка квадрицепса лёжа на боку", ["QUADS"], true),
  s("Бабочка", ["ADDUCTORS", "HIPS"]),
  s("Лягушка", ["ADDUCTORS", "HIPS"]),
  s("Широкая складка сидя", ["ADDUCTORS", "HAMSTRINGS"]),
  s("Растяжка икры у стены", ["CALVES"], true),
  s("Собака мордой вниз", ["CALVES", "HAMSTRINGS"]),
  // Подводящие к шпагату
  s("Полушпагат", ["HAMSTRINGS", "CALVES"], true),
  s("Ящерица", ["HIPS", "ADDUCTORS"], true),
  s("Боковой выпад", ["ADDUCTORS", "HAMSTRINGS"], true),
  s("Продольный шпагат с опорой", ["HIPS", "HAMSTRINGS", "QUADS"], true),
  s("Поперечный шпагат с опорой", ["ADDUCTORS", "HIPS"]),
];

export type StretchProgram = {
  program: string;
  name: string;
  description: string;
  /** [упражнение, подходов]; время удержания (30 с) подставляется при запуске. */
  exercises: [name: string, sets: number][];
  /** Навык цели, к которому ведёт программа: кнопка «Цель: …» в «Начать растяжку». */
  skill?: StretchSkillKey;
};

export const SPLIT_CAUTION = "Тянитесь до натяжения, не до боли, и только после разминки — шпагат приходит за месяцы.";

export const STRETCH_PROGRAMS: StretchProgram[] = [
  {
    program: "Растяжка",
    name: "Утренняя растяжка",
    description: "Около 10 минут, чтобы разбудить тело: шея, плечи, спина, бёдра, икры",
    exercises: [
      ["Наклоны головы в стороны", 2],
      ["Растяжка груди в проёме", 2],
      ["Кошка-корова", 2],
      ["Кобра", 2],
      ["Выпад на сгибатели бедра", 2],
      ["Складка стоя", 2],
      ["Растяжка икры у стены", 2],
    ],
  },
  {
    program: "Растяжка",
    name: "Заминка после силовой",
    description: "Около 8 минут после тренировки: грудь, спина, ноги и ягодицы",
    exercises: [
      ["Растяжка груди в проёме", 2],
      ["Растяжка плеча у груди", 2],
      ["Поза ребёнка", 2],
      ["Голубь", 2],
      ["Растяжка квадрицепса стоя", 2],
      ["Растяжка задней поверхности бедра лёжа", 2],
    ],
  },
  {
    program: "Растяжка",
    name: "Шпагат: продольный",
    description: `Около 20 минут, 3 раза в неделю: сгибатели бедра, задняя поверхность и квадрицепс. ${SPLIT_CAUTION}`,
    skill: "SPLIT_LEFT",
    exercises: [
      ["Выпад на сгибатели бедра", 3],
      ["Ящерица", 2],
      ["Полушпагат", 3],
      ["Голубь", 2],
      ["Растяжка квадрицепса лёжа на боку", 2],
      ["Растяжка задней поверхности бедра лёжа", 2],
      ["Продольный шпагат с опорой", 3],
    ],
  },
  {
    program: "Растяжка",
    name: "Шпагат: поперечный",
    description: `Около 20 минут, 3 раза в неделю: приводящие, тазобедренные и задняя поверхность. ${SPLIT_CAUTION}`,
    skill: "SPLIT_SIDE",
    exercises: [
      ["Бабочка", 2],
      ["Лягушка", 3],
      ["Боковой выпад", 3],
      ["Ящерица", 2],
      ["Широкая складка сидя", 3],
      ["Поперечный шпагат с опорой", 3],
    ],
  },
];

/** Навык, к которому ведёт встроенная программа (по названию шаблона). */
export function programSkill(name: string): StretchSkillKey | null {
  return STRETCH_PROGRAMS.find((p) => p.name === name)?.skill ?? null;
}
