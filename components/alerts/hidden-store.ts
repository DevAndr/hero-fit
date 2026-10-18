/** Оповещения, закрытые «до следующего захода»: id в sessionStorage (живут до закрытия вкладки). */
const KEY = "hf_alerts_hidden";

export function readSessionHidden(storage: Pick<Storage, "getItem"> | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Без доступа к хранилищу (приватный режим, WebView) — молча: скрыто до перезагрузки. */
export function writeSessionHidden(storage: Pick<Storage, "setItem"> | null, ids: Set<string>): void {
  try {
    storage?.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // ничего: состояние останется в памяти страницы
  }
}

/** sessionStorage, если доступен (сам доступ может бросить). */
export function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
