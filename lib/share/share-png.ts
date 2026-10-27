/**
 * Поделиться картинкой с сервера: на телефоне — системное «Поделиться» с файлом (Telegram, VK, Instagram…), где
 * файлы отправлять нельзя (ПК) — скачивание PNG. Ошибка загрузки — исключение; закрытое меню «Поделиться» — не ошибка.
 */
export async function sharePng(url: string, name: string, text: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const file = new File([await res.blob()], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
    return;
  }
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
