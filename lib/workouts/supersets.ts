/**
 * Суперсеты и круговые: группа — подряд идущие упражнения с одним номером `group`.
 * 2 упражнения — «Суперсет», 3–6 — «Круг». Номера всегда приводятся к 1, 2, 3… через `normalizeGroups`.
 */
export const MAX_GROUP = 6;

type Grouped = { group: number | null };

/** Подряд идущие отрезки с одним номером группы: [начало, конец] включительно. */
function runs(items: Grouped[]) {
  const out: [number, number][] = [];
  for (let i = 0; i < items.length; i++) {
    const g = items[i].group;
    if (g === null) continue;
    let end = i;
    while (end + 1 < items.length && items[end + 1].group === g) end++;
    out.push([i, end]);
    i = end;
  }
  return out;
}

/**
 * Одиночка — вне группы; разорванная группа — две; длиннее 6 — режется с начала; номера по порядку с 1.
 * Неизменённые элементы возвращаются теми же объектами.
 */
export function normalizeGroups<T extends Grouped>(items: T[]): T[] {
  const next: (number | null)[] = items.map(() => null);
  let n = 0;
  for (const [start, end] of runs(items)) {
    for (let from = start; from <= end; from += MAX_GROUP) {
      const to = Math.min(end, from + MAX_GROUP - 1);
      if (to === from) continue;
      n++;
      for (let i = from; i <= to; i++) next[i] = n;
    }
  }
  return items.map((item, i) => (item.group === next[i] ? item : { ...item, group: next[i] }));
}

/** Размер группы упражнения `index` (0 — вне группы). */
export function groupSize(items: Grouped[], index: number) {
  const run = runs(items).find(([start, end]) => start <= index && index <= end);
  return run ? run[1] - run[0] + 1 : 0;
}

/** Можно ли связать упражнение `index` со следующим: оба есть, ещё не вместе, итог ≤ 6. */
export function canLink(items: Grouped[], index: number) {
  if (index < 0 || index + 1 >= items.length) return false;
  const a = items[index].group;
  const b = items[index + 1].group;
  if (a !== null && a === b) return false;
  return Math.max(1, groupSize(items, index)) + Math.max(1, groupSize(items, index + 1)) <= MAX_GROUP;
}

const maxGroup = (items: Grouped[]) => items.reduce((m, x) => Math.max(m, x.group ?? 0), 0);

/** Связать упражнение `index` со следующим (их группы сливаются). */
export function link<T extends Grouped>(items: T[], index: number): T[] {
  const list = normalizeGroups(items);
  if (!canLink(list, index)) return list;
  const a = list[index].group;
  const b = list[index + 1].group;
  const target = maxGroup(list) + 1;
  return normalizeGroups(
    list.map((item, i) =>
      i === index || i === index + 1 || (a !== null && item.group === a) || (b !== null && item.group === b) ? { ...item, group: target } : item,
    ),
  );
}

/** Отсоединить следующее за `index` упражнение: группа делится по этой границе. */
export function unlink<T extends Grouped>(items: T[], index: number): T[] {
  const list = normalizeGroups(items);
  const g = list[index]?.group ?? null;
  if (g === null || list[index + 1]?.group !== g) return list;
  const target = maxGroup(list) + 1;
  return normalizeGroups(list.map((item, i) => (i > index && item.group === g ? { ...item, group: target } : item)));
}

/** Метки A1, A2, B1…: буква — порядок группы, цифра — место в ней. */
export function groupLabels(items: Grouped[]): (string | null)[] {
  const labels: (string | null)[] = items.map(() => null);
  runs(items).forEach(([start, end], k) => {
    for (let i = start; i <= end; i++) labels[i] = `${String.fromCharCode(65 + (k % 26))}${i - start + 1}`;
  });
  return labels;
}

export type AfterSet = { kind: "rest"; next: number | null } | { kind: "switch"; next: number };

/**
 * Что после отметки подхода в упражнении `index` (`pending` — невыполненные подходы уже после отметки).
 * Вне группы — отдых. В группе — переход к следующему по кругу упражнению с подходами; круг пройден — отдых,
 * дальше — первое упражнение группы с подходами, а если в группе всё сделано — первое после неё.
 */
export function afterSet(items: (Grouped & { pending: number })[], index: number): AfterSet {
  const firstPending = (from: number, to = items.length - 1) => {
    for (let i = from; i <= to; i++) if (items[i].pending > 0) return i;
    return null;
  };
  const run = runs(items).find(([start, end]) => start <= index && index <= end);
  if (!run) return { kind: "rest", next: items[index]?.pending > 0 ? index : firstPending(index + 1) };
  const [start, end] = run;
  const ahead = firstPending(index + 1, end);
  if (ahead !== null) return { kind: "switch", next: ahead };
  return { kind: "rest", next: firstPending(start, end) ?? firstPending(end + 1) };
}
