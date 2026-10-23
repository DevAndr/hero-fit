import { describe, expect, it } from "vitest";
import { isBot } from "./bots";

describe("isBot", () => {
  it.each(["", null, "Googlebot/2.1", "YandexBot/3.0", "curl/8.4", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120", "TelegramBot (like TwitterBot)"])(
    "бот: %s",
    (ua) => expect(isBot(ua)).toBe(true),
  );

  it("обычный Chrome — не бот", () => {
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe(false);
  });
});
