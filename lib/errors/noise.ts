/** Сетевые сбои (офлайн — штатный режим), циклы ResizeObserver, отмены и чужие скрипты — не ошибки приложения. */
const NOISE = [
  /Failed to fetch/i,
  /NetworkError when attempting to fetch resource/i,
  /^(TypeError: )?Load failed$/i,
  /The network connection was lost/i,
  /ResizeObserver loop/i,
  /AbortError/,
];
const EXTENSION = /(chrome|moz|safari(-web)?)-extension:\/\//;

export function isNoise(e: { message: string; stack: string | null }) {
  if (NOISE.some((re) => re.test(e.message))) return true;
  if (!e.stack && /^Script error\.?$/.test(e.message)) return true;
  const frames = (e.stack ?? "").split("\n").filter((l) => /:\d+:\d+/.test(l));
  return frames.length > 0 && frames.every((l) => EXTENSION.test(l));
}
