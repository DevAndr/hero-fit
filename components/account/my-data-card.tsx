import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** «Мои данные» в настройках: выгрузка по 152-ФЗ — всё в JSON и подходы в CSV. */
export function MyDataCard() {
  return (
    <section id="data" aria-label="Мои данные" className="scroll-mt-20 space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Мои данные</h2>
      <p className="text-sm text-muted-foreground">
        JSON — всё, что о тебе хранится; CSV — подходы строками, откроется в Excel или Google Таблицах.
      </p>
      <div className="flex flex-wrap gap-2">
        {/* Обычные ссылки на скачивание: prefetch не нужен, файл собирается на сервере по запросу */}
        <a href="/account/export/json" download className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download />
          Все данные (JSON)
        </a>
        <a href="/account/export/csv" download className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download />
          Тренировки (CSV)
        </a>
      </div>
    </section>
  );
}
