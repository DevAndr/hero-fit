import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  user: { id: "u1", email: "a@b.ru" as string | null, timeZone: "UTC" },
  cookie: undefined as string | undefined,
  userUpdate: vi.fn(),
  planCreate: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  isEnabled: vi.fn(),
  revalidatePath: vi.fn(),
  /** Записи календаря, пережившие транзакцию (исключение — откат). */
  committed: [] as unknown[],
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (t: unknown) => unknown) => {
      const pending: unknown[] = [];
      const tx = {
        planEntry: { create: async (args: unknown) => (pending.push(args), m.planCreate(args)) },
        workout: { updateMany: m.updateMany },
        user: { update: m.userUpdate },
      };
      const result = await fn(tx);
      m.committed.push(...pending);
      return result;
    },
    workout: { findFirst: m.findFirst, updateMany: m.updateMany },
  },
}));
vi.mock("@/lib/auth/dal", () => ({ requireUser: async () => m.user }));
vi.mock("@/lib/flags/server", () => ({ isEnabled: m.isEnabled }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (m.cookie ? { value: m.cookie } : undefined) }) }));
vi.mock("@/lib/achievements/daily-visit", () => ({ TIMEZONE_COOKIE: "hf_tz" }));

import { dismissScheduleAction, scheduleDraftAction, scheduleNextAction } from "./schedule-actions";

const input = { workoutId: "w1", date: "2026-11-10", time: "19:00", emailReminder: true };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
  m.user.email = "a@b.ru";
  m.cookie = undefined;
  m.isEnabled.mockResolvedValue(true);
  m.findFirst.mockResolvedValue({ id: "w1", name: "Первая", templateId: "t1" });
  m.planCreate.mockResolvedValue({ id: "pe1" });
  m.updateMany.mockResolvedValue({ count: 1 });
  m.committed.length = 0;
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

  describe("пояс первой сессии", () => {
    it("cookie отличается от User.timeZone — пишем её в той же транзакции", async () => {
      m.cookie = "Europe/Moscow";
      await expect(scheduleDraftAction(input)).resolves.toEqual({ ok: true });
      expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { timeZone: "Europe/Moscow" } });
    });

    it("cookie совпадает с User.timeZone — не пишем", async () => {
      m.cookie = "UTC";
      await scheduleDraftAction(input);
      expect(m.userUpdate).not.toHaveBeenCalled();
    });

    it.each([
      ["нет cookie", undefined],
      ["некорректная cookie", "Mars/Base"],
    ])("%s — пояс не меняем", async (_n, cookie) => {
      m.cookie = cookie;
      await expect(scheduleDraftAction(input)).resolves.toEqual({ ok: true });
      expect(m.userUpdate).not.toHaveBeenCalled();
    });

    it("время проверяется по поясу из cookie: 08:00 уже прошло в UTC, но впереди в Гонолулу", async () => {
      const early = { ...input, date: "2026-11-09", time: "08:00" };
      await expect(scheduleDraftAction(early)).resolves.toEqual({ ok: false, error: "Выберите время в будущем" });
      m.cookie = "Pacific/Honolulu";
      await expect(scheduleDraftAction(early)).resolves.toEqual({ ok: true });
    });
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

describe("scheduleNextAction", () => {
  it("своя завершённая тренировка — запись «Тренировка» сохраняется", async () => {
    await expect(scheduleNextAction(input)).resolves.toEqual({ ok: true });
    expect(m.isEnabled).toHaveBeenCalledWith("next_workout_ask", "u1");
    expect(m.committed).toHaveLength(1);
  });

  it("чужая тренировка — отказ, записи нет", async () => {
    // Условие захвата — по владельцу: чужую строку updateMany не находит
    m.updateMany.mockImplementation(async ({ where }: { where: { userId: string } }) => ({ count: where.userId === "other" ? 1 : 0 }));
    const r = await scheduleNextAction({ ...input, workoutId: "foreign" });
    expect(r.ok).toBe(false);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: "foreign", userId: "u1", status: "COMPLETED", scheduleAskedAt: null },
      data: { scheduleAskedAt: expect.any(Date) },
    });
    expect(m.committed).toEqual([]);
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("флаг выключен — отказ, до базы не доходит", async () => {
    m.isEnabled.mockResolvedValue(false);
    await expect(scheduleNextAction(input)).resolves.toEqual({ ok: false, error: "Недоступно" });
    expect(m.isEnabled).toHaveBeenCalledWith("next_workout_ask", "u1");
    expect(m.planCreate).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.committed).toEqual([]);
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
