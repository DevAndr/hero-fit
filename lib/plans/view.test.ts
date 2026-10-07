import { describe, expect, it } from "vitest";
import { dayLabel, eventLabel, shiftDate, viewRange, viewTitle } from "./view";

describe("calendar view helpers", () => {
  it("week range is Monday…Sunday of the date", () => {
    expect(viewRange("week", "2030-01-10")).toEqual({ from: "2030-01-07", to: "2030-01-13" });
  });

  it("month range covers the 6-week grid", () => {
    expect(viewRange("month", "2030-01-10")).toEqual({ from: "2029-12-31", to: "2030-02-10" });
  });

  it("prev/next step by a week or a month (day clamped to the month)", () => {
    expect(shiftDate("week", "2030-01-10", 1)).toBe("2030-01-17");
    expect(shiftDate("month", "2030-01-31", 1)).toBe("2030-02-28");
    expect(shiftDate("month", "2030-01-10", -1)).toBe("2029-12-10");
  });

  it("titles", () => {
    expect(viewTitle("month", "2030-01-10")).toBe("Январь 2030");
    expect(viewTitle("week", "2030-01-10")).toBe("7–13 января 2030");
    expect(viewTitle("week", "2029-12-31")).toBe("31 декабря 2029 – 6 января 2030");
    expect(viewTitle("week", "2030-01-29")).toBe("28 января – 3 февраля 2030");
  });

  it("labels for accessibility", () => {
    expect(dayLabel("2030-01-10")).toBe("четверг, 10 января");
    expect(eventLabel({ title: "Push", date: "2030-01-10", time: "18:00", durationMin: 90 }, "planned")).toBe(
      "Push, четверг, 10 января, 18:00–19:30, запланировано",
    );
    expect(eventLabel({ title: "Ноги", date: "2030-01-10", time: "23:30", durationMin: 60 }, "done")).toBe(
      "Ноги, четверг, 10 января, 23:30–00:30, выполнено",
    );
  });
});
