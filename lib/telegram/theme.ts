/** Схема Telegram → тема next-themes; по умолчанию — тёмная, как у приложения. */
export function themeForScheme(scheme: unknown): "light" | "dark" {
  return scheme === "light" ? "light" : "dark";
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** CSS-цвет (#rgb, #rrggbb, rgb(), rgba()) → #rrggbb для setHeaderColor; прочие форматы — null. */
export function toHex(color: string): string | null {
  const c = color.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (rgb) return `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}`;
  return null;
}
