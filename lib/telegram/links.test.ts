import { describe, expect, it } from "vitest";
import { telegramJoinUrl } from "./links";

describe("telegramJoinUrl", () => {
  it("ссылка на Mini App с кодом тренера", () => {
    expect(telegramJoinUrl("ABCDEFGH", "hero_bot")).toBe("https://t.me/hero_bot?startapp=join_ABCDEFGH");
  });
  it("без бота — нет ссылки", () => {
    expect(telegramJoinUrl("ABCDEFGH", undefined)).toBeNull();
    expect(telegramJoinUrl("ABCDEFGH", "")).toBeNull();
  });
});
