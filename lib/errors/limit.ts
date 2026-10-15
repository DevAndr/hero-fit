/** Счётчик в памяти процесса: не больше `max` событий на ключ за окно `windowMs` (фиксированное окно). */
export function createLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key: string, now = Date.now()): boolean {
      const w = windows.get(key);
      if (!w || now - w.start > windowMs) {
        // Старые окна чистим заодно — карта не растёт бесконечно
        if (windows.size > 10_000) for (const [k, v] of windows) if (now - v.start > windowMs) windows.delete(k);
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      w.count++;
      return w.count <= max;
    },
  };
}
