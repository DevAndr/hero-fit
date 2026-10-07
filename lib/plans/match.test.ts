import { describe, expect, it } from "vitest";
import type { Occurrence } from "./expand";
import { layoutDay, matchPlans, minutesOf, monthGrid, timeOf, type DoneWorkout } from "./match";

const occ = (key: string, date: string, time = "18:00"): Occurrence => ({
  key,
  seriesId: null,
  date,
  time,
  durationMin: 60,
  templateId: null,
  title: "Ноги",
  recurring: false,
});
const workout = (id: string, finishedAt: string, planKey: string | null = null): DoneWorkout => ({
  id,
  planKey,
  startedAt: new Date(Date.parse(finishedAt) - 3_600_000),
  finishedAt: new Date(finishedAt),
});
const MSK = "Europe/Moscow";

describe("matchPlans", () => {
  it("a workout with planKey closes its occurrence", () => {
    const r = matchPlans([occ("e:a", "2026-10-06")], [workout("w1", "2026-10-07T15:00:00Z", "e:a")], "2026-10-07", MSK);
    expect(r.occurrences[0]).toMatchObject({ key: "e:a", status: "done", workoutId: "w1" });
    expect(r.extra).toEqual([]);
  });

  it("a workout without planKey closes the first open occurrence of that local day; the second is extra", () => {
    const r = matchPlans(
      [occ("e:late", "2026-10-07", "19:00"), occ("e:early", "2026-10-07", "08:00")],
      [workout("w1", "2026-10-07T10:00:00Z"), workout("w2", "2026-10-07T12:00:00Z"), workout("w3", "2026-10-07T14:00:00Z")],
      "2026-10-08",
      MSK,
    );
    const byKey = Object.fromEntries(r.occurrences.map((o) => [o.key, o]));
    expect(byKey["e:early"]).toMatchObject({ status: "done", workoutId: "w1" });
    expect(byKey["e:late"]).toMatchObject({ status: "done", workoutId: "w2" });
    expect(r.extra.map((w) => w.id)).toEqual(["w3"]);
  });

  it("local day decides: 22:30 UTC is the next day in Moscow", () => {
    const r = matchPlans([occ("e:a", "2026-10-08")], [workout("w1", "2026-10-07T22:30:00Z")], "2026-10-09", MSK);
    expect(r.occurrences[0]).toMatchObject({ status: "done", workoutId: "w1" });
  });

  it("missed, today and planned", () => {
    const r = matchPlans([occ("e:y", "2026-10-06"), occ("e:t", "2026-10-07"), occ("e:f", "2026-10-08")], [], "2026-10-07", MSK);
    expect(r.occurrences.map((o) => o.status)).toEqual(["missed", "today", "planned"]);
  });

  it("a workout linked to another plan does not close this one", () => {
    const r = matchPlans([occ("e:a", "2026-10-07")], [workout("w1", "2026-10-07T10:00:00Z", "e:other")], "2026-10-08", MSK);
    expect(r.occurrences[0].status).toBe("missed");
    expect(r.extra.map((w) => w.id)).toEqual(["w1"]);
  });
});

describe("layoutDay", () => {
  it("side by side only where events overlap", () => {
    const layout = layoutDay([
      { key: "a", start: 600, end: 660 },
      { key: "b", start: 630, end: 690 },
      { key: "c", start: 680, end: 740 },
      { key: "d", start: 900, end: 960 },
    ]);
    expect(layout.get("a")).toEqual({ col: 0, cols: 2 });
    expect(layout.get("b")).toEqual({ col: 1, cols: 2 });
    expect(layout.get("c")).toEqual({ col: 0, cols: 2 });
    expect(layout.get("d")).toEqual({ col: 0, cols: 1 });
  });
});

describe("calendar helpers", () => {
  it("monthGrid: 42 days from Monday", () => {
    const grid = monthGrid("2026-10");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(grid[3]).toBe("2026-10-01");
    expect(grid.at(-1)).toBe("2026-11-08");
  });

  it("minutesOf / timeOf", () => {
    expect(minutesOf("18:30")).toBe(1110);
    expect(timeOf(1110)).toBe("18:30");
    expect(timeOf(30)).toBe("00:30");
  });
});
