import { describe, expect, it } from "vitest";
import { telegramAppUrl, telegramGuildJoinUrl, telegramJoinUrl } from "./links";

describe("telegramJoinUrl", () => {
  it("ссылка на Mini App с кодом тренера", () => {
    expect(telegramJoinUrl("ABCDEFGH", "hero_bot")).toBe("https://t.me/hero_bot?startapp=join_ABCDEFGH");
  });
  it("без бота — нет ссылки", () => {
    expect(telegramJoinUrl("ABCDEFGH", undefined)).toBeNull();
    expect(telegramJoinUrl("ABCDEFGH", "")).toBeNull();
  });
});

describe("telegramAppUrl", () => {
  it("ссылка на Main Mini App", () => {
    expect(telegramAppUrl("hero_bot")).toBe("https://t.me/hero_bot?startapp");
    expect(telegramAppUrl(undefined)).toBeNull();
  });
});

describe("telegramGuildJoinUrl", () => {
  it("ссылка на Mini App с кодом гильдии; без бота — нет", () => {
    expect(telegramGuildJoinUrl("ABCDEFGH", "bot")).toBe("https://t.me/bot?startapp=guild_ABCDEFGH");
    expect(telegramGuildJoinUrl("ABCDEFGH", undefined)).toBeNull();
  });
});
