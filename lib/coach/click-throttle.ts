/**
 * Ограничение открытий контактов: одно на пару смотрящий–тренер за окно (накрутка счётчика циклом).
 * В памяти процесса и только на время окна — кто открывал, не сохраняется.
 */
export function createClickThrottle(windowMs: number, maxEntries = 10_000) {
  const last = new Map<string, number>();
  const sweep = (now: number) => {
    for (const [key, at] of last) if (now - at >= windowMs) last.delete(key);
  };
  return {
    /** true — открытие считается (и запоминается), false — повтор в пределах окна. */
    take(viewerId: string, coachId: string, now = Date.now()): boolean {
      const key = `${viewerId}:${coachId}`;
      const at = last.get(key);
      if (at !== undefined && now - at < windowMs) return false;
      if (last.size >= maxEntries) sweep(now);
      last.set(key, now);
      return true;
    },
    size: () => last.size,
  };
}
