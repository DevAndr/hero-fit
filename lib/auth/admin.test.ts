import { describe, expect, it } from "vitest";
import { isAdminLogin } from "./admin-login";

describe("isAdminLogin", () => {
  it("логин из списка, без учёта регистра и пробелов", () => {
    expect(isAdminLogin("One", "one, two")).toBe(true);
    expect(isAdminLogin("two", "one, two")).toBe(true);
  });

  it("нет в списке или список пуст", () => {
    expect(isAdminLogin("three", "one, two")).toBe(false);
    expect(isAdminLogin("one", undefined)).toBe(false);
    expect(isAdminLogin("one", "")).toBe(false);
  });

  it("пустые элементы не делают админом пустой логин", () => {
    expect(isAdminLogin("", "one,,")).toBe(false);
    expect(isAdminLogin(" ", " , ")).toBe(false);
  });
});
