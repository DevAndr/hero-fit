/** Навыки гибкости для цели «Навык»: название и что мерить (спека 2026-10-28-stretching-design). */
export const STRETCH_SKILLS = {
  SPLIT_LEFT: { title: "Продольный шпагат (левая впереди)", measure: "см от паха до пола" },
  SPLIT_RIGHT: { title: "Продольный шпагат (правая впереди)", measure: "см от паха до пола" },
  SPLIT_SIDE: { title: "Поперечный шпагат", measure: "см от паха до пола" },
  FOLD_STANDING: { title: "Ладони в пол в наклоне", measure: "см от ладоней до пола" },
  FOLD_SEATED: { title: "Лоб к коленям сидя", measure: "см от лба до колен" },
  BRIDGE: { title: "Мостик", measure: "см от ладоней до пяток" },
} as const satisfies Record<string, { title: string; measure: string }>;

export type StretchSkillKey = keyof typeof STRETCH_SKILLS;
export const STRETCH_SKILL_KEYS = Object.keys(STRETCH_SKILLS) as StretchSkillKey[];

/** Мерка своего навыка. */
export const CUSTOM_SKILL_MEASURE = "см до цели";

export const isSkillKey = (k: string | null | undefined): k is StretchSkillKey => !!k && Object.hasOwn(STRETCH_SKILLS, k);

/** Название навыка цели: из списка по ключу или своё. */
export function skillName(g: { stretchSkill?: string | null; skillTitle?: string | null }): string {
  if (isSkillKey(g.stretchSkill)) return STRETCH_SKILLS[g.stretchSkill].title;
  return g.skillTitle?.trim() || "Навык";
}

export function skillMeasure(g: { stretchSkill?: string | null }): string {
  return isSkillKey(g.stretchSkill) ? STRETCH_SKILLS[g.stretchSkill].measure : CUSTOM_SKILL_MEASURE;
}
