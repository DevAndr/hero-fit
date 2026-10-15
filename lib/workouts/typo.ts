import { plural } from "@/lib/format";

/** Образец для сравнения: прошлый выполненный подход в этой тренировке или подход прошлой тренировки. */
export type TypoReference = { weight: number; reps: number; source: "set" | "last" };

const kg = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/**
 * Подсказка «точно столько?» — значение сильно отличается от образца (лишний или пропущенный ноль).
 * Ничего не блокирует. Вес: ×1,5 и +10 кг вверх или до ¼ вниз (дропсеты до половины — норма).
 * Повторы: ×3 и +15 к образцу, а больше 100 — всегда.
 */
export function typoWarning(set: { weight: number; reps: number }, ref: TypoReference | null): string | null {
  const before = ref?.source === "set" ? "В прошлом подходе" : "В прошлый раз";
  if (ref && ref.weight > 0 && set.weight > 0) {
    const up = set.weight >= ref.weight * 1.5 && set.weight - ref.weight >= 10;
    const down = set.weight <= ref.weight / 4;
    if (up || down) return `${before} ${kg(ref.weight)} кг — точно ${kg(set.weight)}?`;
  }
  if (ref && ref.reps > 0 && set.reps >= ref.reps * 3 && set.reps - ref.reps >= 15) {
    return `${before} ${ref.reps} ${plural(ref.reps, "повтор", "повтора", "повторов")} — точно ${set.reps}?`;
  }
  if (set.reps > 100) return `Точно ${set.reps} ${plural(set.reps, "повтор", "повтора", "повторов")}?`;
  return null;
}
