import { describe, expect, it } from "vitest";
import { clampPos, parsePos, popoverSide } from "./position";

describe("clampPos", () => {
  it("оставляет положение внутри экрана как есть", () => {
    expect(clampPos({ right: 100, bottom: 200 }, 48, 400, 800)).toEqual({ right: 100, bottom: 200 });
  });

  it("не выпускает кнопку за края", () => {
    expect(clampPos({ right: -50, bottom: 5000 }, 48, 400, 800)).toEqual({ right: 8, bottom: 744 });
    expect(clampPos({ right: 1000, bottom: -3 }, 48, 400, 800)).toEqual({ right: 344, bottom: 8 });
  });

  it("на крошечном экране прижимает к отступу", () => {
    expect(clampPos({ right: 30, bottom: 30 }, 48, 40, 40)).toEqual({ right: 8, bottom: 8 });
  });
});

describe("parsePos", () => {
  it("читает сохранённое положение", () => {
    expect(parsePos('{"right":12,"bottom":34}')).toEqual({ right: 12, bottom: 34 });
  });

  it("мусор — null", () => {
    expect(parsePos(null)).toBeNull();
    expect(parsePos("{")).toBeNull();
    expect(parsePos('{"right":"1","bottom":2}')).toBeNull();
    expect(parsePos("null")).toBeNull();
  });
});

describe("popoverSide", () => {
  it("раскрывает карточку к центру экрана", () => {
    expect(popoverSide({ right: 16, bottom: 150 }, 48, 400, 800)).toEqual({ left: false, below: false });
    expect(popoverSide({ right: 340, bottom: 700 }, 48, 400, 800)).toEqual({ left: true, below: true });
  });
});
