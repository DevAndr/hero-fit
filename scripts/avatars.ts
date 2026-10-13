/**
 * PNG аватаров магазина из SVG-исходников: assets/avatars/src/<код>.svg → assets/avatars/<код>.png (256×256).
 * Запуск: npx tsx scripts/avatars.ts. Новый аватар — SVG в src, строка в lib/shop/catalog.ts и lib/shop/avatars.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SHOP_ITEMS } from "../lib/shop/catalog";

const dir = path.join(process.cwd(), "assets", "avatars");
const src = path.join(dir, "src");

async function main() {
  const ids = SHOP_ITEMS.filter((i) => i.kind === "avatar").map((i) => i.code.split(":")[1]);
  const files = new Set(readdirSync(src).map((f) => f.replace(/\.svg$/, "")));
  const missing = ids.filter((id) => !files.has(id));
  if (missing.length) throw new Error(`Нет SVG для аватаров: ${missing.join(", ")}`);
  for (const id of ids) {
    await sharp(readFileSync(path.join(src, `${id}.svg`)))
      .resize(256, 256)
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, `${id}.png`));
    console.log("avatar", id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
