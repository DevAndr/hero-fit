import { describe, expect, it } from "vitest";
import { cleanUtm, decodeSource, decodeUtm, encodeSource, encodeUtm, landingOf, landingOfJoin, referrerOf, utmOf } from "./source";

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

describe("landingOfJoin", () => {
  it("приглашения тренера и клуба; гильдия и прочее — null", () => {
    expect(landingOfJoin("/coach/join/ABC123")).toBe("trainer");
    expect(landingOfJoin("/clubs/join/ABC123")).toBe("club");
    expect(landingOfJoin("/guild/join/ABC123")).toBeNull();
    expect(landingOfJoin("/dashboard")).toBeNull();
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
    expect(referrerOf("https://google.ru/", "hero.fit")).toBe("search");
  });
  it("не поиск: чужие google-поддомены, похожие домены и почта", () => {
    expect(referrerOf("https://mail.google.com/", "hero.fit")).toBe("site");
    expect(referrerOf("https://docs.google.com/", "hero.fit")).toBe("site");
    expect(referrerOf("https://google.evil.com/", "hero.fit")).toBe("site");
    expect(referrerOf("https://mail.yandex.ru/", "hero.fit")).toBe("site");
    expect(referrerOf("https://e.mail.ru/", "hero.fit")).toBe("site");
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

describe("cleanUtm", () => {
  it("нижний регистр, недопустимое — в _, по краям без _, до 64 символов", () => {
    expect(cleanUtm("Ivan Fit")).toBe("ivan_fit");
    expect(cleanUtm("  Маша-Gym.2026 ")).toBe("маша-gym.2026");
    expect(cleanUtm("<script>")).toBe("script");
    expect(cleanUtm("a".repeat(100))).toHaveLength(64);
  });
  it("пусто после чистки → null", () => {
    expect(cleanUtm("!!!")).toBeNull();
    expect(cleanUtm("")).toBeNull();
    expect(cleanUtm(null)).toBeNull();
  });
});

describe("utmOf", () => {
  const p = (q: string) => new URLSearchParams(q);
  it("source и campaign", () => {
    expect(utmOf(p("utm_source=Blogger&utm_campaign=ivan_fit&utm_medium=social"))).toEqual({ source: "blogger", campaign: "ivan_fit" });
    expect(utmOf(p("utm_source=vk"))).toEqual({ source: "vk", campaign: null });
  });
  it("только yclid — Директ без кампании; utm_source важнее", () => {
    expect(utmOf(p("yclid=123"))).toEqual({ source: "yandex_direct", campaign: null });
    expect(utmOf(p("yclid=123&utm_source=yandex&utm_campaign=42"))).toEqual({ source: "yandex", campaign: "42" });
  });
  it("без source и yclid → null", () => {
    expect(utmOf(p("utm_campaign=x"))).toBeNull();
    expect(utmOf(p(""))).toBeNull();
    expect(utmOf(p("utm_source=%21%21"))).toBeNull();
  });
});

describe("encode/decodeUtm", () => {
  it("туда и обратно, с кириллицей и без кампании", () => {
    expect(decodeUtm(encodeUtm({ source: "blogger", campaign: "маша" }))).toEqual({ source: "blogger", campaign: "маша" });
    expect(decodeUtm(encodeUtm({ source: "vk", campaign: null }))).toEqual({ source: "vk", campaign: null });
  });
  it("подделка → null", () => {
    expect(decodeUtm("Evil Value|x")).toBeNull();
    expect(decodeUtm("a|b|c")).toBeNull();
    expect(decodeUtm("|x")).toBeNull();
    expect(decodeUtm("%E0%A4%A|x")).toBeNull();
    expect(decodeUtm(undefined)).toBeNull();
  });
});
