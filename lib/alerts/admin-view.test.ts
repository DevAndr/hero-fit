import { describe, expect, it } from "vitest";
import { groupAlerts } from "./admin-view";

const NOW = new Date("2026-10-18T12:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const row = (id: string, startsAt: Date, endsAt: Date | null = null, enabled = true) => ({ id, enabled, startsAt, endsAt });

describe("groupAlerts", () => {
  it("live, planned and past (ended or disabled)", () => {
    const g = groupAlerts(
      [row("live", at(-10)), row("planned", at(10)), row("ended", at(-60), at(-1)), row("off", at(-10), null, false), row("offPlanned", at(30), null, false)],
      NOW,
    );
    expect(g.live.map((r) => r.id)).toEqual(["live"]);
    expect(g.planned.map((r) => r.id)).toEqual(["planned"]);
    expect(g.past.map((r) => r.id).sort()).toEqual(["ended", "off", "offPlanned"]);
  });
  it("live and planned by start ascending, past by start descending", () => {
    const g = groupAlerts(
      [row("l2", at(-5)), row("l1", at(-50)), row("p2", at(50)), row("p1", at(5)), row("x1", at(-100), at(-90)), row("x2", at(-20), at(-10))],
      NOW,
    );
    expect(g.live.map((r) => r.id)).toEqual(["l1", "l2"]);
    expect(g.planned.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(g.past.map((r) => r.id)).toEqual(["x2", "x1"]);
  });
});
