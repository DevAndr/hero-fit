import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ requireUser: vi.fn(async () => ({ id: "u1", timeZone: "Europe/Moscow" })) }));
const { findFirst, upsert, markAchieved } = vi.hoisted(() => ({ findFirst: vi.fn(), upsert: vi.fn(), markAchieved: vi.fn(async () => true) }));
const tx = { goal: { findFirst }, stretchMeasurement: { upsert } };
vi.mock("@/lib/db", () => ({ db: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } }));
vi.mock("@/lib/achievements/engine", () => ({ evaluateAchievementsNow: vi.fn() }));
vi.mock("@/lib/analytics/queue", () => ({ queueGoal: vi.fn() }));
vi.mock("@/lib/goals/mutations", () => ({ markAchieved }));

import { logStretchMeasurementAction } from "./stretch-actions";

const goal = { id: "g1", type: "STRETCH_SKILL", status: "ACTIVE", target: 0, startValue: 10, deadline: null, stretchSkill: "FOLD_STANDING", skillTitle: null };

describe("logStretchMeasurementAction", () => {
  it("валидация: 0…200, шаг 0,5", async () => {
    for (const bad of [-1, 200.5, 3.3, Number.NaN]) {
      await expect(logStretchMeasurementAction("g1", bad)).resolves.toMatchObject({ ok: false });
    }
    expect(upsert).not.toHaveBeenCalled();
  });

  it("чужая или закрытая цель — отказ без записи", async () => {
    findFirst.mockResolvedValue(null);
    await expect(logStretchMeasurementAction("g1", 5)).resolves.toEqual({ ok: false, error: "Цель не найдена" });
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "g1", userId: "u1", type: "STRETCH_SKILL", status: "ACTIVE" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("замер — upsert по [цель, день]; цель не закрывается, пока > 0", async () => {
    findFirst.mockResolvedValue(goal);
    await expect(logStretchMeasurementAction("g1", 6)).resolves.toEqual({ ok: true, achieved: false });
    expect(upsert.mock.calls[0][0]).toMatchObject({ create: { userId: "u1", goalId: "g1", cm: 6 }, update: { cm: 6 } });
    expect(upsert.mock.calls[0][0].where.goalId_date.goalId).toBe("g1");
    expect(markAchieved).not.toHaveBeenCalled();
  });

  it("замер 0 — цель достигнута с уведомлением", async () => {
    findFirst.mockResolvedValue(goal);
    await expect(logStretchMeasurementAction("g1", 0)).resolves.toEqual({ ok: true, achieved: true });
    expect(markAchieved).toHaveBeenCalledWith(tx, "u1", { id: "g1", title: "Ладони в пол в наклоне" }, expect.any(Date), true);
  });
});
