import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EMPTY_COACH_STATS } from "./definitions";
import { coachStats } from "./coach-stats";

describe("coachStats", () => {
  it("not a coach — empty stats without touching the database (ladders ignore them anyway)", async () => {
    const fail = () => {
      throw new Error("no queries expected");
    };
    const client = new Proxy({}, { get: () => new Proxy(fail, { get: () => fail }) });
    await expect(coachStats(client as never, "u1", false)).resolves.toEqual(EMPTY_COACH_STATS);
  });
});
