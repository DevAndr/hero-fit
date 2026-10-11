import { describe, expect, it } from "vitest";
import { themeForScheme, toHex } from "./theme";

describe("themeForScheme", () => {
  it("светлая — только для light", () => {
    expect(themeForScheme("light")).toBe("light");
    expect(themeForScheme("dark")).toBe("dark");
    expect(themeForScheme(undefined)).toBe("dark");
  });
});

describe("toHex", () => {
  it("hex и rgb — в #rrggbb", () => {
    expect(toHex("#0B0D12")).toBe("#0b0d12");
    expect(toHex("#fff")).toBe("#ffffff");
    expect(toHex("rgb(11, 13, 18)")).toBe("#0b0d12");
    expect(toHex("rgba(255, 255, 255, 0.5)")).toBe("#ffffff");
  });

  it("прочее — null", () => {
    expect(toHex("oklch(0.2 0 0)")).toBeNull();
  });
});
