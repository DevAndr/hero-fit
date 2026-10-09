import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOSSES } from "./bosses";
import { BOSS_SPRITE_FILES } from "./sprite-files";

describe("файлы спрайтов боссов (картинка для сторис)", () => {
  it("у каждого босса есть файл в assets/icons/game/bosses", () => {
    for (const { code } of BOSSES) {
      const file = BOSS_SPRITE_FILES[code];
      expect(file, code).toBeTruthy();
      expect(existsSync(join(process.cwd(), "assets", "icons", "game", "bosses", file)), file).toBe(true);
    }
  });
});
