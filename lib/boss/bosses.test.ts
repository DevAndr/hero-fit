import { describe, expect, it } from "vitest";
import { bossForWeek, bossName } from "./bosses";

describe("bossForWeek", () => {
  it("по кругу по номеру недели", () => {
    expect(bossForWeek("2024-01-01")).toBe("golem");
    expect(bossForWeek("2024-01-08")).toBe("troll");
    expect(bossForWeek("2024-01-29")).toBe("golem");
  });
});

describe("bossName", () => {
  it("имя по коду, неизвестный — «Босс»", () => {
    expect(bossName("dragon")).toBe("Огненный Дракон");
    expect(bossName("x")).toBe("Босс");
  });
});
