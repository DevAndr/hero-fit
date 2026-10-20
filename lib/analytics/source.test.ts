import { describe, expect, it } from "vitest";
import { decodeSource, encodeSource, landingOf, referrerOf } from "./source";

describe("landingOf", () => {
  it("классифицирует пути", () => {
    expect(landingOf("/")).toBe("home");
    expect(landingOf("/training-programs")).toBe("program");
    expect(landingOf("/training-programs/5x5")).toBe("program");
    expect(landingOf("/tools/1rm")).toBe("tool");
    expect(landingOf("/trainer/max")).toBe("trainer");
    expect(landingOf("/gym/msk/iron")).toBe("club");
    expect(landingOf("/register")).toBe("other");
    expect(landingOf("/changelog")).toBe("other");
  });
});

describe("referrerOf", () => {
  it("direct", () => {
    expect(referrerOf(null, "hero.fit")).toBe("direct");
    expect(referrerOf("мусор", "hero.fit")).toBe("direct");
    expect(referrerOf("https://hero.fit/x", "hero.fit")).toBe("direct");
    expect(referrerOf("https://www.hero.fit/x", "hero.fit")).toBe("direct");
  });
  it("search", () => {
    expect(referrerOf("https://yandex.ru/search?text=5x5", "hero.fit")).toBe("search");
    expect(referrerOf("https://www.google.com/", "hero.fit")).toBe("search");
    expect(referrerOf("https://google.com.tr/", "hero.fit")).toBe("search");
    expect(referrerOf("https://ya.ru/", "hero.fit")).toBe("search");
    expect(referrerOf("https://go.mail.ru/search", "hero.fit")).toBe("search");
  });
  it("social", () => {
    expect(referrerOf("https://m.vk.com/wall", "hero.fit")).toBe("social");
    expect(referrerOf("https://t.me/x", "hero.fit")).toBe("social");
    expect(referrerOf("https://dzen.ru/a", "hero.fit")).toBe("social");
  });
  it("site и защита от похожих доменов", () => {
    expect(referrerOf("https://habr.com/ru/articles/1", "hero.fit")).toBe("site");
    expect(referrerOf("https://notvk.com/", "hero.fit")).toBe("site");
    expect(referrerOf("https://mail.ru/", "hero.fit")).toBe("site");
  });
});

describe("encode/decodeSource", () => {
  it("разбирает допустимое", () => {
    expect(decodeSource("program.search")).toEqual({ landing: "program", referrer: "search" });
    expect(decodeSource(encodeSource({ landing: "club", referrer: "site" }))).toEqual({ landing: "club", referrer: "site" });
  });
  it("подделка — null", () => {
    expect(decodeSource("evil.search")).toBeNull();
    expect(decodeSource("program.evil")).toBeNull();
    expect(decodeSource("program")).toBeNull();
    expect(decodeSource("program.search.x")).toBeNull();
    expect(decodeSource(undefined)).toBeNull();
  });
});
