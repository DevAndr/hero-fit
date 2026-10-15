import { createHash } from "node:crypto";

/** Сообщение без изменчивых частей: длинные строки в кавычках, id, числа. */
export function normalizeMessage(message: string) {
  return message
    .replace(/(["'`])[^"'`]{21,}\1/g, "<s>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b(?=[a-z0-9]*\d)[a-z0-9]{16,}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+(\.\d+)?/g, "<n>");
}

/** Первая строка стека из нашего кода (без node_modules и node:internal), без номеров строк и хеша чанка. */
export function topFrame(stack: string | null) {
  const frames = (stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at ") || l.includes("@"));
  const own = frames.find((l) => !l.includes("node_modules") && !l.includes("node:internal")) ?? frames[0] ?? "";
  return own.replace(/(:\d+)+(?=\)?$)/, "").replace(/chunks\/[^/)\s]+\.js/g, "chunks/<chunk>");
}

/** Отпечаток группы: SHA-1 от источника, нормализованного сообщения и первой своей строки стека. */
export function fingerprint(e: { source: string; message: string; stack: string | null }) {
  return createHash("sha1").update(`${e.source}\n${normalizeMessage(e.message)}\n${topFrame(e.stack)}`).digest("hex");
}
