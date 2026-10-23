import { describe, expect, it } from "vitest";
import { coachGuide, type CoachGuideFacts } from "./guide";

const none: CoachGuideFacts = { published: false, everClients: 0, templates: 0, assigned: false, commented: false, programs: 0, clientId: null };

describe("coachGuide", () => {
  it("новый тренер: 0 из 6, шаги по порядку, без клиента назначение и комментарий недоступны", () => {
    const g = coachGuide(none);
    expect(g.steps.map((s) => s.key)).toEqual(["page", "invite", "template", "assign", "comment", "program"]);
    expect([g.done, g.total, g.complete]).toEqual([0, 6, false]);
    expect(g.steps.find((s) => s.key === "page")).toMatchObject({ done: false, href: "/coach/page", locked: null });
    expect(g.steps.find((s) => s.key === "invite")).toMatchObject({ href: "#invite" });
    expect(g.steps.find((s) => s.key === "template")).toMatchObject({ href: "/templates/new" });
    expect(g.steps.find((s) => s.key === "assign")).toMatchObject({ href: null, locked: "Сначала пригласите клиента" });
    expect(g.steps.find((s) => s.key === "comment")).toMatchObject({ href: null, locked: "Сначала пригласите клиента" });
    expect(g.steps.find((s) => s.key === "program")).toMatchObject({ href: "/coach/programs" });
  });

  it("с клиентом — ссылки на его план и тренировки", () => {
    const g = coachGuide({ ...none, everClients: 1, templates: 2, clientId: "c1" });
    expect(g.done).toBe(2);
    expect(g.steps.find((s) => s.key === "assign")).toMatchObject({ done: false, href: "/coach/clients/c1?tab=plan", locked: null });
    expect(g.steps.find((s) => s.key === "comment")).toMatchObject({ href: "/coach/clients/c1?tab=workouts", locked: null });
  });

  it("выполненный шаг засчитан и без активного клиента (клиент ушёл)", () => {
    const g = coachGuide({ ...none, everClients: 1, assigned: true, commented: true, clientId: null });
    expect(g.steps.filter((s) => s.done).map((s) => s.key)).toEqual(["invite", "assign", "comment"]);
    expect(g.steps.find((s) => s.key === "assign")?.locked).toBeNull();
  });

  it("всё сделано — complete", () => {
    const g = coachGuide({ published: true, everClients: 3, templates: 1, assigned: true, commented: true, programs: 1, clientId: "c1" });
    expect([g.done, g.complete]).toEqual([6, true]);
  });
});
