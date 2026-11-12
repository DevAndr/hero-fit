"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Swords } from "lucide-react";
import { BossSprite } from "@/components/boss/boss-sprite";
import { FirstStrikeDialog, type StrikeSuccess } from "@/components/first-strike/first-strike-dialog";
import { Button } from "@/components/ui/button";
import type { BossView } from "@/lib/boss/queries";

/**
 * «Первый удар» на дашборде: карточка над героем недели и диалог. Диалог и результат удара живут здесь, поэтому
 * обновление страницы сразу после удара (offer = false) их не сбрасывает.
 * offer — показывать карточку (удар доступен и экскурсия пройдена); autoOpen — открыть диалог сразу (`?strike=1`).
 */
export function FirstStrikeHost({ offer, autoOpen, boss }: { offer: boolean; autoOpen: boolean; boss: BossView | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [result, setResult] = useState<StrikeSuccess | null>(null);

  // Переход на ?strike=1 без перемонтирования (экскурсия на том же дашборде): сравниваем с прошлым значением при рендере
  const [prevAutoOpen, setPrevAutoOpen] = useState(autoOpen);
  if (autoOpen !== prevAutoOpen) {
    setPrevAutoOpen(autoOpen);
    if (autoOpen) setOpen(true);
  }

  // После удара — свежие данные страницы (босс, опыт); диалог и результат живут здесь и не сбрасываются
  const struck = (next: StrikeSuccess) => {
    setResult(next);
    router.refresh();
  };
  // Убрать ?strike=1, чтобы перезагрузка не открыла диалог снова; без параметра URL не трогаем
  const close = () => {
    setOpen(false);
    if (new URLSearchParams(window.location.search).has("strike")) router.replace("/dashboard", { scroll: false });
  };
  const toTraining = () => {
    setOpen(false);
    router.push("/training");
  };

  const card = offer && !result;
  if (!card && !open) return null;

  return (
    <>
      {card ? (
        <section
          aria-label="Первый удар"
          data-testid="first-strike-card"
          className="flex items-center gap-4 rounded-xl border border-streak/40 bg-streak/5 p-4"
        >
          {boss ? <BossSprite code={boss.code} size={64} className="max-sm:hidden" /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-bold">
              <Swords className="size-4 text-streak" aria-hidden />
              Первый удар
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Нанеси первый удар боссу — один подход без инвентаря, 2 минуты</p>
          </div>
          <Button size="lg" className="shrink-0" onClick={() => setOpen(true)}>
            Ударить
          </Button>
        </section>
      ) : null}
      <FirstStrikeDialog open={open} boss={result?.boss ?? boss} result={result} onStruck={struck} onClose={close} onSelf={toTraining} />
    </>
  );
}
