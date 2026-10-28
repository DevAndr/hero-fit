import { describe, expect, it } from "vitest";
import { STRETCH_ZONES, primaryZone, stretchZoneLabel } from "./zones";

describe("зоны растяжки", () => {
  it("10 зон в порядке спеки", () => {
    expect(STRETCH_ZONES).toHaveLength(10);
    expect(STRETCH_ZONES[0]).toBe("NECK");
    expect(STRETCH_ZONES[9]).toBe("CALVES");
  });
  it("подписи", () => {
    expect(stretchZoneLabel("HAMSTRINGS")).toBe("Задняя поверхность бедра");
    for (const z of STRETCH_ZONES) expect(stretchZoneLabel(z).length).toBeGreaterThan(0);
  });
  it("основная зона — первая", () => {
    expect(primaryZone([])).toBeNull();
    expect(primaryZone(["HIPS", "BACK"])).toBe("HIPS");
  });
});
