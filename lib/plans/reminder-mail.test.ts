import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { findFirst, sendMail } = vi.hoisted(() => ({ findFirst: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { planEntry: { findFirst } } }));
vi.mock("@/lib/mail", () => ({ sendMail }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://hero-fit.ru" } }));

import { sendPlanReminderMail } from "./reminder-mail";

const occ = { key: "e:1", title: "Грудь", time: "19:00", date: "2026-10-08" };

afterEach(() => {
  vi.restoreAllMocks();
  findFirst.mockReset();
  sendMail.mockReset();
});

describe("sendPlanReminderMail", () => {
  it("шлёт при галочке и адресе", async () => {
    findFirst.mockResolvedValue({ emailReminder: true, user: { email: "a@b" } });
    await sendPlanReminderMail("u1", occ, "2026-10-08");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "1", userId: "u1", emailReminder: true } }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b", subject: "Тренировка сегодня в 19:00" }));
  });

  it("без галочки не шлёт", async () => {
    findFirst.mockResolvedValue(null);
    await sendPlanReminderMail("u1", occ, "2026-10-08");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("без адреса не шлёт", async () => {
    findFirst.mockResolvedValue({ emailReminder: true, user: { email: null } });
    await sendPlanReminderMail("u1", occ, "2026-10-08");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("серия не шлёт", async () => {
    await sendPlanReminderMail("u1", { ...occ, key: "s:1:2026-10-08" }, "2026-10-08");
    expect(findFirst).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("ошибка SMTP не бросает", async () => {
    findFirst.mockResolvedValue({ emailReminder: true, user: { email: "a@b" } });
    sendMail.mockRejectedValue(new Error("smtp down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendPlanReminderMail("u1", occ, "2026-10-08")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
