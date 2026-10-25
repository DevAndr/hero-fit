import { describe, expect, it } from "vitest";
import { calendarSummary, dayPreview, groupByDay, statusOf, type CoachCalendarItem } from "./calendar";

const item = (p: Partial<CoachCalendarItem>): CoachCalendarItem => ({
  key: `e:${Math.random()}`,
  clientId: "c1",
  clientName: "Маша",
  clientTz: "Europe/Moscow",
  date: "2026-10-27",
  time: "19:00",
  title: "Ноги",
  status: "upcoming",
  ...p,
});

describe("statusOf", () => {
  it("статусы плана → статусы календаря тренера", () => {
    expect(statusOf("done")).toBe("done");
    expect(statusOf("missed")).toBe("missed");
    expect(statusOf("today")).toBe("upcoming");
    expect(statusOf("planned")).toBe("upcoming");
    expect(statusOf("skipped")).toBe("skipped");
  });
});

describe("groupByDay", () => {
  it("по дням, внутри — по времени, затем по имени", () => {
    const days = groupByDay([
      item({ clientName: "Яна", time: "18:00" }),
      item({ clientName: "Аня", time: "18:00" }),
      item({ clientName: "Боря", time: "09:00" }),
      item({ clientName: "Вова", date: "2026-10-28" }),
    ]);
    expect([...days.keys()]).toEqual(["2026-10-27", "2026-10-28"]);
    expect(days.get("2026-10-27")!.map((i) => i.clientName)).toEqual(["Боря", "Аня", "Яна"]);
  });
});

describe("dayPreview", () => {
  it("первые N и сколько ещё", () => {
    expect(dayPreview([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(dayPreview([1])).toEqual({ shown: [1], more: 0 });
  });
});

describe("calendarSummary", () => {
  it("тренировки, клиенты и выполнено из прошедших", () => {
    expect(
      calendarSummary([
        item({ status: "done" }),
        item({ status: "skipped" }),
        item({ status: "missed", clientId: "c2" }),
        item({ status: "upcoming", clientId: "c2" }),
        item({ status: "upcoming" }),
      ]),
    ).toEqual({ workouts: 5, clients: 2, done: 1, past: 3 });
  });
});
