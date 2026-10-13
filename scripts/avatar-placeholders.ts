/**
 * Одноразовая генерация заглушек аватаров: круг цвета редкости + первая буква названия.
 * Запуск: npx tsx scripts/avatar-placeholders.ts. Настоящие картинки можно положить поверх файлов.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SHOP_ITEMS, type Rarity } from "../lib/shop/catalog";

const COLORS: Record<Rarity, string> = {
  common: "#64748b",
  rare: "#2563eb",
  epic: "#9333ea",
  legendary: "#d97706",
};

const dir = path.join(process.cwd(), "assets", "avatars");
mkdirSync(dir, { recursive: true });

async function main() {
  for (const item of SHOP_ITEMS) {
    if (item.kind !== "avatar") continue;
    const id = item.code.split(":")[1];
    const letter = item.name[0];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <circle cx="128" cy="128" r="128" fill="${COLORS[item.rarity]}"/>
    <circle cx="128" cy="100" r="44" fill="rgba(255,255,255,0.28)"/>
    <path d="M40 220c0-48 40-76 88-76s88 28 88 76a128 128 0 0 1-176 0z" fill="rgba(255,255,255,0.28)"/>
    <text x="128" y="152" font-family="Arial, sans-serif" font-size="110" font-weight="700" text-anchor="middle" fill="#ffffff">${letter}</text>
  </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(path.join(dir, `${id}.png`), png);
    console.log("avatar", id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
