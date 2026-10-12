import { describe, expect, it, vi } from "vitest";
import { reachGoal } from "./reach";

describe("reachGoal", () => {
  it("цель уходит в счётчик с клиента, без сервера", () => {
    const ym = vi.fn();
    reachGoal("assistant_open", { ym, id: 42 });
    expect(ym).toHaveBeenCalledWith(42, "reachGoal", "assistant_open");
  });
  it("без счётчика — ничего", () => {
    expect(() => reachGoal("assistant_open", { ym: undefined, id: 42 })).not.toThrow();
    const ym = vi.fn();
    reachGoal("assistant_open", { ym, id: null });
    expect(ym).not.toHaveBeenCalled();
  });
});
