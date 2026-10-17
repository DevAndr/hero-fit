import { describe, expect, it } from "vitest";
import { templateCopyRows } from "./copy-rows";

describe("templateCopyRows", () => {
  it("копирует структуру без веса и своей прогрессии автора", () => {
    const row = { exerciseId: "e1", order: 2, targetSets: 4, targetReps: 8, restSec: 120, supersetGroup: 1, targetWeight: 80, step: 2.5, fails: 2 };
    expect(templateCopyRows([row])).toEqual([{ exerciseId: "e1", order: 2, targetSets: 4, targetReps: 8, restSec: 120, supersetGroup: 1 }]);
  });

  it("пустой шаблон — без строк", () => {
    expect(templateCopyRows([])).toEqual([]);
  });
});
