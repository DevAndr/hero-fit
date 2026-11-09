import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  user: { id: "u1", email: "a@b.ru" as string | null, timeZone: "UTC" },
  planCreate: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  isEnabled: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const tx = { planEntry: { create: m.planCreate }, workout: { updateMany: m.updateMany } };
  return {
    db: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      workout: { findFirst: m.findFirst, updateMany: m.updateMany },
    },
  };
});
vi.mock("@/lib/auth/dal", () => ({ requireUser: async () => m.user }));
vi.mock("@/lib/flags/server", () => ({ isEnabled: m.isEnabled }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { dismissScheduleAction, scheduleDraftAction } from "./schedule-actions";

const input = { workoutId: "w1", date: "2026-11-10", time: "19:00", emailReminder: true };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
  m.user.email = "a@b.ru";
  m.isEnabled.mockResolvedValue(true);
  m.findFirst.mockResolvedValue({ id: "w1", name: "Первая", templateId: "t1" });
  m.planCreate.mockResolvedValue({ id: "pe1" });
  m.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("scheduleDraftAction", () => {
  it("привязывает черновик и создаёт запись", async () => {
    await expect(scheduleDraftAction(input)).resolves.toEqual({ ok: true });
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "w1", userId: "u1", status: "PLANNED" } }));
    expect(m.planCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        title: "Первая",
        templateId: "t1",
        date: "2026-11-10",
        time: "19:00",
        durationMin: 60,
        emailReminder: true,
      }),
    });
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: "w1", userId: "u1", status: "PLANNED", planKey: null },
      data: { planKey: "e:pe1", scheduleAskedAt: expect.any(Date) },
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/training");
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(m.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("второй вызов откатывает запись", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    await expect(scheduleDraftAction(input)).resolves.toEqual({ ok: false, error: "Тренировка уже запланирована" });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("без email галочка не сохраняется", async () => {
    m.user.email = null;
    await scheduleDraftAction(input);
    expect(m.planCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ emailReminder: false }) });
  });

  it("флаг выключен", async () => {
    m.isEnabled.mockResolvedValue(false);
    const r = await scheduleDraftAction(input);
    expect(r.ok).toBe(false);
    expect(m.planCreate).not.toHaveBeenCalled();
  });

  it("время в прошлом", async () => {
    await expect(scheduleDraftAction({ ...input, date: "2026-11-08" })).resolves.toEqual({ ok: false, error: "Выберите время в будущем" });
    expect(m.planCreate).not.toHaveBeenCalled();
  });

  it("тренировка не найдена", async () => {
    m.findFirst.mockResolvedValue(null);
    await expect(scheduleDraftAction(input)).resolves.toEqual({ ok: false, error: "Тренировка не найдена" });
    expect(m.planCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["дата", { date: "2026-13-40" }],
    ["время", { time: "25:99" }],
    ["workoutId", { workoutId: "" }],
    ["emailReminder", { emailReminder: "yes" }],
  ])("некорректное поле %s не доходит до базы", async (_n, patch) => {
    const r = await scheduleDraftAction({ ...input, ...patch } as never);
    expect(r).toEqual({ ok: false, error: "Проверьте дату и время" });
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.planCreate).not.toHaveBeenCalled();
  });
});

describe("dismissScheduleAction", () => {
  it("ставит отметку только если не спрашивали", async () => {
    await dismissScheduleAction("w1");
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: "w1", userId: "u1", scheduleAskedAt: null },
      data: { scheduleAskedAt: expect.any(Date) },
    });
  });
});
