import type { FocusEvent, MouseEvent, PointerEvent } from "react";

/**
 * Пропсы для числового поля: фокус выделяет всё значение — новое число заменяет старое (вес, повторы).
 * С клавиатуры (Tab) — выделение в следующем кадре после фокуса (iOS Safari сбрасывает его сразу). Клик или тап
 * ставит курсор уже после фокуса (на телефонах — и после `mouseup`), поэтому касание, которое дало фокус, выделяет
 * на `click` — он последний. Повторный клик по полю в фокусе ставит курсор как обычно.
 */
export const selectOnFocus = {
  onPointerDown(e: PointerEvent<HTMLInputElement>) {
    if (document.activeElement !== e.currentTarget) e.currentTarget.dataset.focusClick = "1";
  },
  onFocus(e: FocusEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    // Фокус от касания выделит click; кадр с клавиатуры не трогает поле, если в нём уже начали печатать
    if (el.dataset.focusClick) return;
    const value = el.value;
    requestAnimationFrame(() => {
      if (document.activeElement === el && el.value === value) el.select();
    });
  },
  onClick(e: MouseEvent<HTMLInputElement>) {
    if (!e.currentTarget.dataset.focusClick) return;
    delete e.currentTarget.dataset.focusClick;
    e.currentTarget.select();
  },
  onBlur(e: FocusEvent<HTMLInputElement>) {
    delete e.currentTarget.dataset.focusClick;
  },
};
