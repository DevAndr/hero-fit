import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { RecordCard } from "@/lib/share/record-card";
import { STORY_SIZE } from "@/lib/share/story-image";

// Цвета тёмной темы в hex (satori не понимает oklch) — как в lib/share/story-image.tsx
const BG = "#0a0a0a";
const CARD = "#171717";
const MUTED = "#a1a1a1";
const PRIMARY = "#00d492";
const XP = "#fdc700";

const asset = (...parts: string[]) => readFile(join(process.cwd(), "assets", ...parts));

/** Знак Hero Fit — lucide «dumbbell» на зелёном, как app/pwa-icon. */
function Logo({ size }: { size: number }) {
  const glyph = Math.round(size * 0.6);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size * 0.28, background: PRIMARY }}>
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke={BG} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
        <path d="m2.5 21.5 1.4-1.4" />
        <path d="m20.1 3.9 1.4-1.4" />
        <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
        <path d="m9.6 14.4 4.8-4.8" />
      </svg>
    </div>
  );
}

/** Карточка рекорда 1080×1920: упражнение, результат, прирост к прошлому рекорду, уровень и логотип. */
export async function recordCardImage(c: RecordCard): Promise<ImageResponse> {
  const [c5, c8, l5, l8] = await Promise.all([
    asset("fonts", "unbounded-cyrillic-500.woff"),
    asset("fonts", "unbounded-cyrillic-800.woff"),
    asset("fonts", "unbounded-latin-500.woff"),
    asset("fonts", "unbounded-latin-800.woff"),
  ]);
  // Длинное название упражнения — мельче, чтобы влезло в 2–3 строки
  const titleSize = c.exercise.length > 28 ? 64 : c.exercise.length > 16 ? 80 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 88,
          background: `radial-gradient(circle at 50% 38%, ${XP}2e, transparent 45%), radial-gradient(circle at 90% 4%, ${PRIMARY}33, transparent 35%), ${BG}`,
          color: "#fafafa",
          fontFamily: "UnboundedLatin, UnboundedCyrillic",
        }}
      >
        {/* Шапка */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <Logo size={76} />
            <div style={{ fontSize: 42, fontWeight: 800 }}>Hero Fit</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, color: MUTED }}>{c.date}</div>
        </div>

        {/* Рекорд */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 40 }}>
          <div style={{ display: "flex", padding: "16px 34px", borderRadius: 999, background: `${XP}2e`, color: XP, fontSize: 38, fontWeight: 800 }}>
            Новый рекорд!
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1 }}>{c.exercise}</div>
            <div style={{ fontSize: 36, fontWeight: 500, color: MUTED }}>{c.label}</div>
          </div>
          <div style={{ fontSize: c.value.length > 10 ? 132 : 176, fontWeight: 800, color: XP, lineHeight: 1 }}>{c.value}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", padding: "18px 32px", borderRadius: 28, background: `${PRIMARY}26`, color: PRIMARY, fontSize: 42, fontWeight: 800 }}>
              {c.change}
            </div>
            {c.previous ? <div style={{ fontSize: 34, fontWeight: 500, color: MUTED, paddingLeft: 8 }}>{c.previous}</div> : null}
          </div>
        </div>

        {/* Уровень */}
        <div style={{ display: "flex", alignItems: "center", gap: 32, padding: 36, borderRadius: 40, background: CARD }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 136,
              height: 136,
              borderRadius: 68,
              background: `${XP}2e`,
              color: XP,
              fontSize: 60,
              fontWeight: 800,
            }}
          >
            {c.level}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 42, fontWeight: 800 }}>{`Уровень ${c.level}`}</div>
            {c.nickname ? <div style={{ fontSize: 32, fontWeight: 500, color: MUTED }}>{c.nickname}</div> : null}
          </div>
        </div>

        {/* Подвал */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <span style={{ fontWeight: 800, color: PRIMARY }}>hero-fit.ru</span>
          <span style={{ fontWeight: 500, color: MUTED }}>дневник тренировок-игра</span>
        </div>
      </div>
    ),
    {
      ...STORY_SIZE,
      fonts: [
        { name: "UnboundedLatin", data: l5, weight: 500 },
        { name: "UnboundedLatin", data: l8, weight: 800 },
        { name: "UnboundedCyrillic", data: c5, weight: 500 },
        { name: "UnboundedCyrillic", data: c8, weight: 800 },
      ],
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
