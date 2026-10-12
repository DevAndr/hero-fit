import type { FlagKey } from "@/lib/flags/registry";

/** Пункт релиза; flag — фича под флагом: виден, только если флаг включён у смотрящего (гостю — при 100 %). */
export type ChangeItem = { text: string; href?: string; flag?: FlagKey };

/** Релиз «Что нового» (lib/changelog/releases.ts): id — ключ и якорь, date — YYYY-MM-DD. */
export type Release = {
  id: string;
  date: string;
  title: string;
  summary: string;
  new: ChangeItem[];
  improved?: ChangeItem[];
  fixed?: ChangeItem[];
};

export const SECTIONS = [
  ["new", "Новое"],
  ["improved", "Улучшено"],
  ["fixed", "Исправлено"],
] as const;
