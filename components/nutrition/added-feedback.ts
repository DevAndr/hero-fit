import { haptic } from "@/lib/telegram/webapp";

/** Запись добавлена — короткая вибрация на телефоне и в Telegram (как у отметки подхода); правка и удаление — без неё. */
export function addedFeedback() {
  navigator.vibrate?.(30);
  haptic("light");
}
