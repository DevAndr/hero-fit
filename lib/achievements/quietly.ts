/** Побочная выдача (ачивки) не должна ломать страницу или уже выполненное действие: ошибка — в лог и fallback. */
export async function quietly<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error("[achievements] side evaluation failed", e);
    return fallback;
  }
}
