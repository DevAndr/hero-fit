import { describe, expect, it } from "vitest";
import { sortFavoritesFirst } from "./favorites";

describe("sortFavoritesFirst", () => {
  it("избранные первыми, внутри — по названию", () => {
    const items = [
      { name: "Б", favorite: false },
      { name: "В", favorite: true },
      { name: "А", favorite: true },
      { name: "А2", favorite: false },
    ];
    expect(sortFavoritesFirst(items).map((e) => e.name)).toEqual(["А", "В", "А2", "Б"]);
  });
});
