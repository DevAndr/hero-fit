import { describe, expect, it } from "vitest";
import { canPublish, coachProfileSchema, publicAwards, statsToCompute, visibleStats, type CoachStats } from "./profile";

const ok = { displayName: "Иван", city: "Казань", format: "BOTH", specialties: ["strength"], about: "x".repeat(60), hiddenStats: [], showAwards: true };

describe("coachProfileSchema", () => {
  it("пустые строки — null, about обрезается", () => {
    const r = coachProfileSchema.parse({ ...ok, displayName: "  ", city: "", about: "  текст  " });
    expect(r).toMatchObject({ displayName: null, city: null, about: "текст" });
  });
  it("ограничения", () => {
    expect(coachProfileSchema.safeParse({ ...ok, displayName: "x".repeat(51) }).success).toBe(false);
    expect(coachProfileSchema.safeParse({ ...ok, about: "x".repeat(1001) }).success).toBe(false);
    expect(coachProfileSchema.safeParse({ ...ok, specialties: ["strength", "mass", "fat_loss", "beginners", "rehab"] }).success).toBe(false);
    expect(coachProfileSchema.safeParse({ ...ok, specialties: ["yoga"] }).success).toBe(false);
    expect(coachProfileSchema.safeParse({ ...ok, specialties: ["mass", "mass"] }).success).toBe(false);
    expect(coachProfileSchema.safeParse({ ...ok, hiddenStats: ["x"] }).success).toBe(false);
    expect(coachProfileSchema.safeParse({ ...ok, format: "ZOOM" }).success).toBe(false);
  });
});

describe("canPublish", () => {
  it("нужны ник и описание от 50 символов", () => {
    expect(canPublish({ about: ok.about }, null)).toBe("Сначала задайте ник");
    expect(canPublish({ about: "x".repeat(49) }, "Coach")).toBe("Расскажите о себе — минимум 50 символов");
    expect(canPublish({ about: ok.about }, "Coach")).toBeNull();
  });
});

describe("visibleStats", () => {
  const since = new Date("2026-10-05T12:00:00Z");
  const s = (o: Partial<CoachStats>): CoachStats => ({ clients: 2, workouts: 148, records: 37, plan: 0.86, planTotal: 7, since, ...o });
  const codes = (st: CoachStats, hidden: string[] = []) => visibleStats(st, hidden).map((x) => x.code);

  it("до 3 клиентов — только клиенты и стаж", () => {
    expect(codes(s({}))).toEqual(["clients", "since"]);
  });
  it("от 3 клиентов — цифры по клиентам; план — от 5 назначений", () => {
    expect(codes(s({ clients: 3 }))).toEqual(["clients", "workouts", "records", "plan", "since"]);
    expect(codes(s({ clients: 3, planTotal: 4 }))).toEqual(["clients", "workouts", "records", "since"]);
    expect(codes(s({ clients: 3, plan: null }))).toEqual(["clients", "workouts", "records", "since"]);
  });
  it("у нового тренера нет «0 клиентов»", () => {
    expect(codes(s({ clients: 0, since: null }))).toEqual([]);
  });
  it("скрытые и без даты", () => {
    expect(codes(s({ clients: 3 }), ["clients", "plan"])).toEqual(["workouts", "records", "since"]);
    expect(codes(s({ since: null }))).toEqual(["clients"]);
  });
  it("подписи и склонения", () => {
    const one = visibleStats(s({ clients: 1 }), []);
    expect(one[0]).toMatchObject({ value: "1", label: "клиент" });
    expect(visibleStats(s({ clients: 2 }), [])[0].label).toBe("клиента");
    const all = visibleStats(s({ clients: 5, workouts: 21, records: 2 }), []);
    expect(all.map((x) => `${x.value} ${x.label}`)).toEqual([
      "5 клиентов",
      "21 тренировка клиентов за 30 дней",
      "2 рекорда клиентов за 30 дней",
      "86 % плана выполнено",
      "с октября 2026 в Hero Fit",
    ]);
  });
});

describe("statsToCompute", () => {
  it("до 3 клиентов — ничего по клиентам", () => {
    expect(statsToCompute(2, [])).toEqual({ activity: false, plan: false });
  });
  it("от 3 — активность и план, скрытое не считаем", () => {
    expect(statsToCompute(3, [])).toEqual({ activity: true, plan: true });
    expect(statsToCompute(3, ["plan"])).toEqual({ activity: true, plan: false });
    expect(statsToCompute(3, ["workouts", "records"])).toEqual({ activity: false, plan: true });
    expect(statsToCompute(3, ["workouts"])).toEqual({ activity: true, plan: true });
  });
});

describe("publicAwards", () => {
  it("только тренерские, без «На виду», вершины лестниц первыми", () => {
    expect(publicAwards(["coachclients:1", "coachclients:3", "coachpage:1", "workouts:5", "coachworkouts:1000"])).toEqual([
      "coachworkouts:1000",
      "coachclients:3",
      "coachclients:1",
    ]);
  });

  it("при равной ступени — порядок лестниц, не больше 6", () => {
    const codes = ["coachgoals:1", "coachprs:10", "coachclients:1", "coachcomments:1", "coachworkouts:10", "coachprog:5", "coachgoals:5"];
    expect(publicAwards(codes)).toEqual(["coachgoals:5", "coachclients:1", "coachcomments:1", "coachworkouts:10", "coachprs:10", "coachprog:5"]);
    expect(publicAwards([...codes, ...codes])).toHaveLength(6);
  });

  it("showAwards по умолчанию включён", () => {
    expect(coachProfileSchema.parse({ ...ok, showAwards: undefined }).showAwards).toBe(true);
  });
});
