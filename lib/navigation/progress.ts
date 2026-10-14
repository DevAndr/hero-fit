/** Клик, который приведёт к переходу внутри приложения (без перезагрузки) — для полоски загрузки сверху. */
export type ClickInfo = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
export type AnchorInfo = { href: string; target: string; download: boolean };

/**
 * Куда ведёт клик по ссылке (путь + query) или null, если это не клиентский переход:
 * не левая кнопка или с модификатором (новая вкладка), target, download, другой сайт, якорь или та же страница.
 */
export function navigationTarget(anchor: AnchorInfo, click: ClickInfo, current: URL): string | null {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.download) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, current);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  const to = url.pathname + url.search;
  return to === current.pathname + current.search ? null : to;
}
