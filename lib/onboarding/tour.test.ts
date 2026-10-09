import { describe, expect, it } from "vitest";
import { chestAutoOpen, nextStep, prevStep, stepNumber, TOUR_STEPS, type TourStep } from "./tour";

const all = () => true;
const without = (...ids: string[]) => (s: TourStep) => !ids.includes(s.id);
const noTargets = (s: TourStep) => !s.target;

describe("шаги экскурсии", () => {
  it("порядок и заголовки из спеки", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["welcome", "xp", "streak", "boss", "body-map", "nav", "first-workout"]);
    expect(TOUR_STEPS.map((s) => s.title)).toEqual([
      "Добро пожаловать в Hero Fit",
      "Уровень и опыт",
      "Недельный streak",
      "Босс недели",
      "Карта мышц",
      "Разделы",
      "Первая тренировка",
    ]);
    expect(TOUR_STEPS[0].target).toBeUndefined();
    expect(TOUR_STEPS[6].target).toBeUndefined();
  });

  it("все доступны — по одному шагу, без выхода за границы", () => {
    expect(nextStep(0, all)).toBe(1);
    expect(nextStep(6, all)).toBe(6);
    expect(prevStep(0, all)).toBe(0);
    expect(prevStep(6, all)).toBe(5);
  });

  it("недоступный шаг пропускается в обе стороны", () => {
    expect(nextStep(3, without("body-map"))).toBe(5);
    expect(prevStep(5, without("body-map"))).toBe(3);
  });

  it("без элементов на странице — от приветствия сразу к финалу", () => {
    expect(nextStep(0, noTargets)).toBe(6);
    expect(prevStep(6, noTargets)).toBe(0);
  });

  it("первый и последний шаги доступны всегда", () => {
    const none = () => false;
    expect(nextStep(0, none)).toBe(6);
    expect(prevStep(6, none)).toBe(0);
  });

  it("счётчик считает только доступные шаги", () => {
    expect(stepNumber(0, all)).toEqual({ current: 1, total: 7 });
    expect(stepNumber(5, without("body-map"))).toEqual({ current: 5, total: 6 });
  });
});

describe("автооткрытие ежедневного сундука", () => {
  it("не во время экскурсии", () => {
    expect(chestAutoOpen(true, null)).toBe(false);
    expect(chestAutoOpen(true, new Date())).toBe(true);
    expect(chestAutoOpen(false, new Date())).toBe(false);
  });
});
