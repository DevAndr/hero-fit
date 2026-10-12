import { describe, expect, it, vi } from "vitest";
import { flushWellbeing, pendingWellbeing, sendWellbeing } from "./wellbeing-queue";

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

describe("wellbeing queue", () => {
  it("ответ сервера (даже отказ) — запись убирается", async () => {
    const s = memory();
    await sendWellbeing("w1", "TIRED", async () => ({ ok: false }), s);
    expect(pendingWellbeing(s)).toEqual([]);
    await sendWellbeing("w2", "OK", async () => ({ ok: true }), s);
    expect(pendingWellbeing(s)).toEqual([]);
  });

  it("без сети — остаётся и уходит при следующей отправке очереди", async () => {
    const s = memory();
    await sendWellbeing("w1", "TIRED", () => Promise.reject(new Error("offline")), s);
    expect(pendingWellbeing(s)).toEqual([{ workoutId: "w1", value: "TIRED" }]);
    const save = vi.fn(async () => ({ ok: true }));
    await flushWellbeing(save, s);
    expect(save).toHaveBeenCalledWith("w1", "TIRED");
    expect(pendingWellbeing(s)).toEqual([]);
  });

  it("мусор в хранилище пропускается", () => {
    const s = memory();
    s.setItem("hf:wellbeing:w1", "HACK");
    s.setItem("hf:other", "OK");
    expect(pendingWellbeing(s)).toEqual([]);
  });
});
