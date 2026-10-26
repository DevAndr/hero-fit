import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Все page.tsx и layout.tsx под app/. */
function renderFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return renderFiles(p);
    return /^(page|layout)\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe("queueGoal", () => {
  // queueGoal пишет cookie — в рендере Server Component это ошибка (500 на проде, где есть счётчик Метрики;
  // в e2e счётчика нет и queueGoal выходит раньше — тесты страниц такое не ловят). Цель при показе — <ReachGoal />.
  it("не вызывается при рендере страниц и layout", () => {
    const offenders = renderFiles(join(process.cwd(), "app")).filter((f) => /\bqueueGoal\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
