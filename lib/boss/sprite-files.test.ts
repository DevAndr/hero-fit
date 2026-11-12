import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOSSES, SEASONAL_BOSSES } from "./bosses";
import { BOSS_SPRITE_FILES, isOpaqueSprite } from "./sprite-files";

describe("isOpaqueSprite", () => {
  it("непрозрачный фон — только у Гринча; неизвестный код — нет", () => {
    expect(isOpaqueSprite("grinch")).toBe(true);
    expect(BOSSES.some((b) => isOpaqueSprite(b.code))).toBe(false);
    expect(isOpaqueSprite("yeti")).toBe(false);
  });
});

describe("файлы спрайтов боссов (картинка для сторис)", () => {
  it("у каждого босса есть файл в assets/icons/game/bosses", () => {
    for (const { code } of [...BOSSES, ...SEASONAL_BOSSES]) {
      const file = BOSS_SPRITE_FILES[code];
      expect(file, code).toBeTruthy();
      expect(existsSync(join(process.cwd(), "assets", "icons", "game", "bosses", file)), file).toBe(true);
    }
  });
});
