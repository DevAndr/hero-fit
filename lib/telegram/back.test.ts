import { describe, expect, it } from "vitest";
import { backTarget, isRootPath } from "./back";

describe("isRootPath", () => {
  it("разделы меню и /coach — корень", () => {
    expect(isRootPath("/dashboard")).toBe(true);
    expect(isRootPath("/coach")).toBe(true);
    expect(isRootPath("/templates")).toBe(true);
    expect(isRootPath("/workouts/abc")).toBe(false);
  });
});

describe("backTarget", () => {
  it("корень — некуда", () => {
    expect(backTarget("/dashboard")).toBeNull();
  });

  it("вложенная страница — ближайший раздел", () => {
    expect(backTarget("/workouts/abc")).toBe("/training");
    expect(backTarget("/workouts/abc/story")).toBe("/training");
    expect(backTarget("/stats/exercises/x")).toBe("/stats");
    expect(backTarget("/coach/clients/x")).toBe("/coach");
    expect(backTarget("/coach/page")).toBe("/coach");
    expect(backTarget("/templates/x/edit")).toBe("/templates");
  });

  it("страница вне разделов — кабинет", () => {
    expect(backTarget("/settings")).toBe("/dashboard");
    expect(backTarget("/recap")).toBe("/dashboard");
  });
});
