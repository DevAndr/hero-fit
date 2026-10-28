import { describe, expect, it } from "vitest";
import { STRETCH_SKILLS, STRETCH_SKILL_KEYS, skillName } from "./skills";

describe("навыки растяжки", () => {
  it("названия и мерки из спеки", () => {
    expect(STRETCH_SKILLS.SPLIT_SIDE.title).toBe("Поперечный шпагат");
    expect(STRETCH_SKILLS.FOLD_STANDING.title).toBe("Ладони в пол в наклоне");
    expect(STRETCH_SKILLS.SPLIT_LEFT.title).toBe("Продольный шпагат (левая впереди)");
    expect(STRETCH_SKILLS.FOLD_STANDING.measure).toBe("см от ладоней до пола");
    expect(STRETCH_SKILL_KEYS).toHaveLength(6);
    for (const k of STRETCH_SKILL_KEYS) expect(STRETCH_SKILLS[k].measure.startsWith("см")).toBe(true);
  });
  it("skillName: ключ или своё название", () => {
    expect(skillName({ stretchSkill: "BRIDGE", skillTitle: null })).toBe("Мостик");
    expect(skillName({ stretchSkill: null, skillTitle: "Складка у стены" })).toBe("Складка у стены");
    expect(skillName({ stretchSkill: null, skillTitle: null })).toBe("Навык");
  });
});
