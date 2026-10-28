import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ requireUser: vi.fn(async () => ({ id: "u1", timeZone: "Europe/Moscow" })) }));
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { exercise: { findFirst } } }));
vi.mock("@/lib/achievements/engine", () => ({}));
vi.mock("@/lib/analytics/queue", () => ({}));
const { isEnabled } = vi.hoisted(() => ({ isEnabled: vi.fn() }));
vi.mock("@/lib/flags/server", () => ({ isEnabled }));
vi.mock("@/lib/goals/queries", () => ({}));
vi.mock("@/lib/goals/mutations", () => ({}));
vi.mock("@/lib/shop/earn", () => ({}));

import { createGoalAction } from "./actions";

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
});
