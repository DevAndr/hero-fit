import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";

export const alt = "Hero Fit — дневник тренировок в игровом стиле: уровни, streak, ачивки";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

// Цвета — те же, что токены тёмной темы (primary / xp / streak), в hex: satori не понимает oklch
const BG = "#0a0a0a";
const PRIMARY = "#00d492";
const XP = "#fdc700";
const STREAK = "#ff8904";

/** Картинка для соцсетей и мессенджеров (наследуют все публичные страницы). */
export default async function OpengraphImage() {
  const [c5, c8, l5, l8] = await Promise.all([
    font("unbounded-cyrillic-500.woff"),
    font("unbounded-cyrillic-800.woff"),
    font("unbounded-latin-500.woff"),
    font("unbounded-latin-800.woff"),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `radial-gradient(circle at 85% 15%, ${PRIMARY}33, transparent 45%), radial-gradient(circle at 10% 95%, ${STREAK}22, transparent 40%), ${BG}`,
          color: "#fafafa",
          // Латиница и кириллица — разные файлы: satori ищет глиф по цепочке имён
          fontFamily: "UnboundedLatin, UnboundedCyrillic",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: PRIMARY, display: "flex" }} />
          <div style={{ fontSize: 36, fontWeight: 800 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, display: "flex", flexWrap: "wrap" }}>
            Тренируйся как&nbsp;<span style={{ color: PRIMARY }}>герой</span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 500, color: "#a1a1a1", maxWidth: 900 }}>
            Дневник тренировок, где каждый подход — это XP, уровни и ачивки
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 26, fontWeight: 800 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: XP }}>LVL 7</span>
            <div style={{ width: 320, height: 18, borderRadius: 9, background: "#262626", display: "flex" }}>
              <div style={{ width: 230, height: 18, borderRadius: 9, background: XP }} />
            </div>
          </div>
          <span style={{ color: STREAK }}>Серия 4 недели</span>
          <span style={{ color: PRIMARY }}>+25 XP рекорд</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "UnboundedLatin", data: l5, weight: 500, style: "normal" },
        { name: "UnboundedLatin", data: l8, weight: 800, style: "normal" },
        { name: "UnboundedCyrillic", data: c5, weight: 500, style: "normal" },
        { name: "UnboundedCyrillic", data: c8, weight: 800, style: "normal" },
      ],
    },
  );
}
