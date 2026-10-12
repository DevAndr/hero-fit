import { describe, expect, it } from "vitest";
import { STREAK_WEEK_TARGET } from "@/lib/progress/weekly-streak";
import { HELP_TOPICS, TIPS } from "./content";
import { painReply, replaceReply, staticReply, weightReply, type NodeId } from "./scenarios";

/** Все статичные узлы, достижимые из меню по переходам. */
function walk(): Map<NodeId, NonNullable<ReturnType<typeof staticReply>>> {
  const seen = new Map<NodeId, NonNullable<ReturnType<typeof staticReply>>>();
  const queue: NodeId[] = ["menu"];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const reply = staticReply(id);
    if (!reply) continue;
    seen.set(id, reply);
    for (const b of reply.buttons) if ("go" in b) queue.push(b.go);
  }
  return seen;
}

describe("дерево сценариев", () => {
  const nodes = walk();

  it("меню, справка, советы и правила на месте", () => {
    for (const id of ["menu", "help", "tips", "rules", "pain"]) expect(nodes.has(id)).toBe(true);
    for (const t of HELP_TOPICS) expect(nodes.has(`help:${t.id}`)).toBe(true);
    for (const t of TIPS) expect(nodes.has(`tips:${t.id}`)).toBe(true);
  });

  it("из каждого узла есть «Назад в меню»", () => {
    for (const [id, reply] of nodes) {
      if (id === "menu") continue;
      expect(reply.buttons.some((b) => "go" in b && b.go === "menu"), id).toBe(true);
    }
  });

  it("статичные переходы ведут на существующие узлы или на узлы с данными", () => {
    const dynamic = /^(stall|missed|recovery|workout-menu|exercise:.+)$/;
    for (const reply of nodes.values()) {
      for (const b of reply.buttons) {
        if ("go" in b && !dynamic.test(b.go)) expect(staticReply(b.go), b.go).not.toBeNull();
        if ("href" in b) expect(b.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("неизвестный узел — null", () => {
    expect(staticReply("nope")).toBeNull();
  });
});

describe("тексты", () => {
  const all = [...HELP_TOPICS, ...TIPS].map((t) => t.text);

  it("без подталкивания через боль", () => {
    for (const text of all) expect(text).not.toMatch(/через силу|терпи|не сдавайся/i);
  });

  it("цифры из правил приложения", () => {
    expect(HELP_TOPICS.find((t) => t.id === "streak")!.text).toContain(`${STREAK_WEEK_TARGET} тренировки`);
  });

  it("10–15 советов, совет о боли — к врачу", () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(10);
    expect(TIPS.length).toBeLessThanOrEqual(15);
    expect(TIPS.find((t) => t.id === "pain")!.text).toContain("к врачу");
  });
});

describe("узлы с данными", () => {
  const ex = { id: "sq", name: "Присед" };
  it("боль — пропустить, к врачу, кнопка «Убрать»", () => {
    const r = weightReply(ex, { kind: "pain" });
    expect(r.text).toContain("Не делай через боль. Пропусти это упражнение сегодня.");
    expect(r.text).toContain("обратись к врачу");
    expect(r.buttons).toContainEqual({ label: "Убрать из тренировки", action: "remove", payload: "sq" });
    const p = painReply("knee", [ex], true);
    expect(p.buttons).toContainEqual({ label: "Убрать: Присед", action: "remove", payload: "sq" });
    expect(p.text).toContain("обратись к врачу");
  });
  it("совет по весу — подход и «Подставить»", () => {
    const r = weightReply(ex, { kind: "sets", source: "hint", weight: 62.5, reps: 8, sets: 3, why: "…" });
    expect(r.text).toBe("Пора прибавить: 3 × 8 · 62,5 кг.");
    expect(r.buttons[0]).toEqual({ label: "Подставить в подходы", action: "apply-sets", payload: "sq" });
  });
  it("замена при сделанных подходах — «Добавить вместо»", () => {
    expect(replaceReply(ex, [{ id: "lp", name: "Жим ногами" }], true).buttons[0]).toEqual({ label: "Добавить вместо: Жим ногами", action: "replace", payload: "sq>lp" });
    expect(replaceReply(ex, [], false).text).toBe("Подходящей замены нет — можно просто пропустить.");
  });
});

describe("выполненные подходы не теряются", () => {
  const ex = { id: "sq", name: "Присед" };
  it("при сделанных подходах — «Пропустить оставшиеся подходы»", () => {
    expect(weightReply(ex, { kind: "pain" }, true).buttons[0]).toEqual({ label: "Пропустить оставшиеся подходы", action: "remove", payload: "sq" });
    expect(painReply("knee", [ex], true, new Set(["sq"])).buttons[0]).toEqual({ label: "Пропустить оставшиеся: Присед", action: "remove", payload: "sq" });
  });
});

describe("тексты без рода", () => {
  // Глаголы прошедшего времени мужского рода, которые легко написать по привычке
  const gendered = /(^|[^а-яё])(набрал|спал|устал|понял|убрал|подставил|дошёл|сказал|пропустил|отметил)([^а-яё]|$)/i;
  it("справка, советы, меню и правила", () => {
    const texts = [...HELP_TOPICS, ...TIPS].map((t) => t.text);
    for (const id of ["menu", "rules", "pain", "help", "tips"]) {
      const r = staticReply(id)!;
      texts.push(r.text, ...r.buttons.map((b) => b.label));
    }
    for (const t of texts) expect(t).not.toMatch(gendered);
  });
});
