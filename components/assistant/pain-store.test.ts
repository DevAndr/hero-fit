import { describe, expect, it } from "vitest";
import { prunePain, readPain, writePain } from "./pain-store";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    map,
  };
}

describe("pain store", () => {
  it("по тренировке, мусор — пусто", () => {
    const s = memory();
    writePain("w1", ["knee", "shoulder"], s);
    expect(readPain("w1", s)).toEqual(["knee", "shoulder"]);
    expect(readPain("w2", s)).toEqual([]);
    s.setItem("hf:pain:w3", "{oops");
    expect(readPain("w3", s)).toEqual([]);
    s.setItem("hf:pain:w4", JSON.stringify(["knee", "hack"]));
    expect(readPain("w4", s)).toEqual(["knee"]);
  });

  it("чистка — всё, кроме текущей тренировки", () => {
    const s = memory();
    writePain("w1", ["knee"], s);
    writePain("w2", ["neck"], s);
    s.setItem("hf:workout:w2", "x");
    prunePain("w2", s);
    expect([...s.map.keys()].sort()).toEqual(["hf:pain:w2", "hf:workout:w2"]);
  });

  it("выход из аккаунта — боль убирается вся", () => {
    const s = memory();
    writePain("w1", ["knee"], s);
    writePain("w2", ["neck"], s);
    prunePain(null, s);
    expect([...s.map.keys()]).toEqual([]);
  });
});
