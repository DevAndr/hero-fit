/** Контраст WCAG двух цветов в hex (#rgb или #rrggbb). */
function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Фон карточки — hex-эквиваленты `--card` из app/globals.css: светлая oklch(1 0 0), тёмная oklch(0.205 0 0). */
export const CARD_BG = { light: "#ffffff", dark: "#171717" } as const;

/**
 * Смысловые цвета, общие для всех тем (не входят в палитру скина) — hex-эквиваленты из app/globals.css, тем цветом,
 * каким они пишут текст: в светлой теме «Важно» — text-warning-foreground на подложке bg-warning/20, в тёмной —
 * dark:text-warning.
 */
export const SEMANTIC_HEX = {
  light: { destructive: "#e7000b", warningForeground: "#461901" },
  dark: { destructive: "#ff6467", warning: "#ffb900" },
} as const;
