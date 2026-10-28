import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { BossCode } from "@/lib/boss/bosses";
import { BOSS_SPRITE_FILES } from "@/lib/boss/sprite-files";
import { plural } from "@/lib/format";
import { STREAK_WEEK_TARGET } from "@/lib/progress/weekly-streak";
import type { StoryData } from "@/lib/share/story";

export const STORY_SIZE = { width: 1080, height: 1920 };


// Цвета тёмной темы в hex (satori не понимает oklch) — как в app/opengraph-image.tsx
const BG = "#0a0a0a";
const CARD = "#171717";
const MUTED = "#a1a1a1";
const TRACK = "#262626";
const PRIMARY = "#00d492";
const XP = "#fdc700";
const STREAK = "#ff8904";
const DANGER = "#fb2c36";

const asset = (...parts: string[]) => readFile(join(process.cwd(), "assets", ...parts));

async function bossSprite(code: string): Promise<string | null> {
  const file = BOSS_SPRITE_FILES[code as BossCode];
  if (!file) return null;
  const png = await asset("icons", "game", "bosses", file);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function Bar({ percent, color, height }: { percent: number; color: string; height: number }) {
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: height / 2, background: TRACK }}>
      <div style={{ display: "flex", width: `${Math.max(0, Math.min(100, percent))}%`, height, borderRadius: height / 2, background: color }} />
    </div>
  );
}

export async function storyImage(d: StoryData): Promise<ImageResponse> {
  const [c5, c8, l5, l8, sprite] = await Promise.all([
    asset("fonts", "unbounded-cyrillic-500.woff"),
    asset("fonts", "unbounded-cyrillic-800.woff"),
    asset("fonts", "unbounded-latin-500.woff"),
    asset("fonts", "unbounded-latin-800.woff"),
    d.boss ? bossSprite(d.boss.code) : Promise.resolve(null),
  ]);
  const weeks = plural(d.streak ?? 0, "неделя", "недели", "недель");

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
          background: `radial-gradient(circle at 85% 8%, ${PRIMARY}33, transparent 40%), radial-gradient(circle at 10% 92%, ${STREAK}26, transparent 40%), ${BG}`,
          color: "#fafafa",
          fontFamily: "UnboundedLatin, UnboundedCyrillic",
        }}
      >
        {/* Шапка */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: PRIMARY, display: "flex" }} />
              <div style={{ fontSize: 40, fontWeight: 800 }}>Hero Fit</div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 500, color: MUTED }}>{d.date}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{d.title}</div>
            {d.nickname ? <div style={{ fontSize: 34, fontWeight: 500, color: MUTED }}>{d.nickname}</div> : null}
          </div>
        </div>

        {/* Опыт и уровень */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 168, fontWeight: 800, color: XP, lineHeight: 1 }}>{`+${d.xpGained} XP`}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 40, fontWeight: 800 }}>
            <span>{`Уровень ${d.level}`}</span>
            {d.leveledUp ? (
              <span style={{ display: "flex", padding: "10px 24px", borderRadius: 999, background: `${XP}2e`, color: XP, fontSize: 30 }}>
                Новый уровень!
              </span>
            ) : null}
          </div>
          <Bar percent={d.levelPercent} color={XP} height={28} />
        </div>

        {/* Босс недели */}
        {d.boss ? (
          <div style={{ display: "flex", alignItems: "center", gap: 36, padding: 36, borderRadius: 40, background: CARD }}>
            {sprite ? (
              // satori (next/og) рисует только обычный <img>; next/image здесь неприменим
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sprite} alt="" width={300} height={214} style={{ objectFit: "contain" }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 500, color: MUTED }}>Босс недели</div>
              <div style={{ fontSize: 40, fontWeight: 800 }}>{d.boss.name}</div>
              {d.boss.defeated ? (
                <div style={{ fontSize: 44, fontWeight: 800, color: PRIMARY }}>Повержен!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: DANGER }}>{`Урон −${d.boss.damage}`}</div>
                  <Bar percent={(d.boss.hpLeft / d.boss.hp) * 100} color={DANGER} height={20} />
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Рекорды */}
        {d.records.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: XP }}>Личные рекорды</div>
            {d.records.map((r) => (
              <div key={r.exercise} style={{ display: "flex", justifyContent: "space-between", gap: 24, fontSize: 34 }}>
                <span style={{ fontWeight: 500, color: "#e5e5e5", maxWidth: 560 }}>{r.exercise}</span>
                <span style={{ fontWeight: 800 }}>{r.value}</span>
              </div>
            ))}
            {d.moreRecords ? <div style={{ fontSize: 28, color: MUTED }}>{`и ещё ${d.moreRecords}`}</div> : null}
          </div>
        ) : null}

        {/* Streak и итоги */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Сессия растяжки серию не двигает — блока нет */}
          {d.streak !== null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 112,
                  height: 112,
                  borderRadius: 56,
                  background: `${STREAK}2e`,
                  color: STREAK,
                  fontSize: 56,
                  fontWeight: 800,
                }}
              >
                {d.streak}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 38, fontWeight: 800 }}>
                  {d.streak ? `${weeks} подряд` : "Серия начинается"}
                </div>
                {d.weekCount !== null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {Array.from({ length: STREAK_WEEK_TARGET }, (_, i) => (
                      <div key={i} style={{ display: "flex", width: 28, height: 28, borderRadius: 14, background: i < (d.weekCount ?? 0) ? STREAK : TRACK }} />
                    ))}
                    <span style={{ fontSize: 28, color: MUTED, marginLeft: 8 }}>
                      {`${Math.min(d.weekCount, STREAK_WEEK_TARGET)}/${STREAK_WEEK_TARGET} за неделю`}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div style={{ fontSize: 32, fontWeight: 500, color: MUTED }}>{d.stats.join("  ·  ")}</div>
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
