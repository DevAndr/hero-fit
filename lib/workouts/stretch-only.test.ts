import { describe, expect, it } from "vitest";
import { isStretchOnly } from "./kinds";

const done = (durationSec: number, reps = 0) => ({ reps, durationSec, completedAt: new Date() });
const planned = (reps: number) => ({ reps, durationSec: null, completedAt: null });

describe("isStretchOnly", () => {
  it("stretches done, strength left unchecked — a stretch session", () => {
    expect(
      isStretchOnly([
        { kind: "STRETCH", sets: [done(45), done(60)] },
        { kind: "REPS", sets: [planned(10)] },
      ]),
    ).toBe(true);
  });

  it("one checked strength set — a regular workout", () => {
    expect(
      isStretchOnly([
        { kind: "STRETCH", sets: [done(45)] },
        { kind: "REPS", sets: [{ reps: 10, durationSec: null, completedAt: new Date() }] },
      ]),
    ).toBe(false);
  });

  it("nothing done — not a session", () => {
    expect(isStretchOnly([])).toBe(false);
    expect(isStretchOnly([{ kind: "STRETCH", sets: [{ reps: 0, durationSec: 30, completedAt: null }] }])).toBe(false);
  });

  it("timed exercise done — not a stretch session", () => {
    expect(
      isStretchOnly([
        { kind: "STRETCH", sets: [done(45)] },
        { kind: "TIME", sets: [done(60)] },
      ]),
    ).toBe(false);
  });
});
