import { describe, expect, it } from "vitest";
import { readSessionHidden, writeSessionHidden } from "./hidden-store";

function fakeStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("session hidden alerts", () => {
  it("no storage — empty set, writing does not throw", () => {
    expect(readSessionHidden(null)).toEqual(new Set());
    expect(() => writeSessionHidden(null, new Set(["a"]))).not.toThrow();
  });
  it("broken JSON or a non-array — empty set", () => {
    expect(readSessionHidden({ getItem: () => "{oops" })).toEqual(new Set());
    expect(readSessionHidden({ getItem: () => '{"a":1}' })).toEqual(new Set());
  });
  it("throwing storage — empty set and no exception", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    expect(readSessionHidden({ getItem: boom })).toEqual(new Set());
    expect(() => writeSessionHidden({ setItem: boom }, new Set(["a"]))).not.toThrow();
  });
  it("round trip", () => {
    const s = fakeStorage();
    writeSessionHidden(s, new Set(["a", "b"]));
    expect(readSessionHidden(s)).toEqual(new Set(["a", "b"]));
  });
});
