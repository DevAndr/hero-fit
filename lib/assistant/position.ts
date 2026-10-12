/** Положение плавающей кнопки помощника: отступы от правого и нижнего края экрана, px. */
export type FloatPos = { right: number; bottom: number };

/** Отступ от краёв экрана, px. */
export const FLOAT_MARGIN = 8;
/** Сдвиг пальца, после которого нажатие считается перетаскиванием, px. */
export const DRAG_THRESHOLD = 6;

/** Держит кнопку размера `size` целиком на экране `width × height`. */
export function clampPos(pos: FloatPos, size: number, width: number, height: number): FloatPos {
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, FLOAT_MARGIN), Math.max(FLOAT_MARGIN, max)));
  return {
    right: clamp(pos.right, width - size - FLOAT_MARGIN),
    bottom: clamp(pos.bottom, height - size - FLOAT_MARGIN),
  };
}

/** Сохранённое положение из localStorage; мусор — null (кнопка на месте по умолчанию). */
export function parsePos(raw: string | null): FloatPos | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { right, bottom } = v as Record<string, unknown>;
    if (typeof right !== "number" || typeof bottom !== "number" || !Number.isFinite(right) || !Number.isFinite(bottom)) return null;
    return { right, bottom };
  } catch {
    return null;
  }
}

/** Куда раскрывать карточку чек-ина: к центру экрана от кнопки. */
export function popoverSide(pos: FloatPos, size: number, width: number, height: number) {
  return {
    left: pos.right + size / 2 > width / 2,
    below: pos.bottom + size / 2 > height / 2,
  };
}
