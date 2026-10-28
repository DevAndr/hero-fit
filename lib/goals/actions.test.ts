import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ requireUser: vi.fn(async () => ({ id: "u1", timeZone: "Europe/Moscow" })) }));
const { findFirst, create } = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn() }));
const tx = { $queryRaw: vi.fn(), goal: { findMany: vi.fn(async () => []), create } };
vi.mock("@/lib/db", () => ({ db: { exercise: { findFirst }, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } }));
vi.mock("@/lib/achievements/engine", () => ({}));
vi.mock("@/lib/analytics/queue", () => ({ queueGoal: vi.fn() }));
const { isEnabled } = vi.hoisted(() => ({ isEnabled: vi.fn() }));
vi.mock("@/lib/flags/server", () => ({ isEnabled }));
vi.mock("@/lib/goals/queries", () => ({ currentValueFor: vi.fn(async () => 0) }));
vi.mock("@/lib/goals/mutations", () => ({}));
vi.mock("@/lib/shop/earn", () => ({}));

import { createGoalAction } from "./actions";
import { weeklyDeadline } from "./stretch-weekly";

describe("createGoalAction", () => {
  it("силовая цель — только по силовому упражнению: кардио и на время не подходят", async () => {
    findFirst.mockResolvedValue(null);
    const deadline = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    await expect(
      createGoalAction({ type: "STRENGTH", exerciseId: "run", metric: "MAX_WEIGHT", target: 100, deadline } as never),
    ).resolves.toMatchObject({ ok: false, field: "exerciseId" });
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ kind: "REPS" });
  });

  it("цель удержания — только при флаге stretching и по упражнению растяжки", async () => {
    const deadline = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const input = { type: "STRETCH_HOLD", exerciseId: "fold", target: 60, deadline } as never;
    findFirst.mockClear();
    isEnabled.mockResolvedValue(false);
    await expect(createGoalAction(input)).resolves.toMatchObject({ ok: false });
    expect(findFirst).not.toHaveBeenCalled();
    isEnabled.mockResolvedValue(true);
    findFirst.mockResolvedValue(null);
    await expect(createGoalAction(input)).resolves.toMatchObject({ ok: false, field: "exerciseId" });
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ kind: "STRETCH" });
  });

  it("регулярность — только при флаге; срок — воскресенье последней недели, считаем с нуля", async () => {
    const input = { type: "STRETCH_WEEKLY", stretchUnit: "MINUTES", target: 30, weeks: 4, deadline: null } as never;
    isEnabled.mockResolvedValue(false);
    await expect(createGoalAction(input)).resolves.toEqual({ ok: false, error: "Цели растяжки недоступны" });
    expect(create).not.toHaveBeenCalled();
    isEnabled.mockResolvedValue(true);
    await expect(createGoalAction(input)).resolves.toEqual({ ok: true });
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: "STRETCH_WEEKLY", stretchUnit: "MINUTES", target: 30, startValue: 0, exerciseId: null });
    expect(data.deadline).toBe(weeklyDeadline(data.createdAt, 4, "Europe/Moscow"));
  });

  it("навык — только при флаге; старт в startValue, цель 0, ключ или своё название", async () => {
    create.mockClear();
    const input = { type: "STRETCH_SKILL", stretchSkill: "FOLD_STANDING", startCm: 10, target: 0, deadline: null } as never;
    isEnabled.mockResolvedValue(false);
    await expect(createGoalAction(input)).resolves.toEqual({ ok: false, error: "Цели растяжки недоступны" });
    expect(create).not.toHaveBeenCalled();
    isEnabled.mockResolvedValue(true);
    await expect(createGoalAction(input)).resolves.toEqual({ ok: true });
    expect(create.mock.calls[0][0].data).toMatchObject({ type: "STRETCH_SKILL", target: 0, startValue: 10, stretchSkill: "FOLD_STANDING", skillTitle: null, exerciseId: null });
    await createGoalAction({ type: "STRETCH_SKILL", skillTitle: "Складка у стены", startCm: 7.5, target: 0, deadline: null } as never);
    expect(create.mock.calls[1][0].data).toMatchObject({ startValue: 7.5, stretchSkill: null, skillTitle: "Складка у стены" });
  });
});
