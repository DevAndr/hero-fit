/**
 * Строки упражнений копии шаблона программы: упражнение, порядок, подходы, повторы, отдых, суперсет.
 * Вес, шаг и неудачи своей прогрессии не копируются — вес ведёт программа от баз занимающегося.
 */
export function templateCopyRows(
  rows: { exerciseId: string; order: number; targetSets: number; targetReps: number | null; restSec: number | null; supersetGroup: number | null }[],
) {
  return rows.map((r) => ({
    exerciseId: r.exerciseId,
    order: r.order,
    targetSets: r.targetSets,
    targetReps: r.targetReps,
    restSec: r.restSec,
    supersetGroup: r.supersetGroup,
  }));
}
