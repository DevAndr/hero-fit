"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sharePng } from "@/lib/share/share-png";

/** Окно уже всплывало для этой тренировки (localStorage устройства) — второй раз само не открывается. */
const seenKey = (workoutId: string) => `hf:record-card:${workoutId}`;

function takeFirstShow(workoutId: string) {
  try {
    if (localStorage.getItem(seenKey(workoutId))) return false;
    localStorage.setItem(seenKey(workoutId), "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Карточки рекордов (тумблер в /settings): окно «Новый рекорд!» с картинкой по каждому упражнению с рекордом.
 * autoOpen — тренировка только что завершена: окно всплывает само один раз; потом — кнопкой у рекордов.
 */
export function RecordCardDialog({ workoutId, exercises, day, autoOpen }: { workoutId: string; exercises: string[]; day: string; autoOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // localStorage читается после монтирования (на сервере его нет)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpen && takeFirstShow(workoutId)) setOpen(true);
  }, [autoOpen, workoutId]);

  const exercise = exercises[index];
  const src = `/workouts/${workoutId}/records/${index}/card`;

  async function share() {
    setBusy(true);
    try {
      const name = exercises.length > 1 ? `hero-fit-record-${day}-${index + 1}.png` : `hero-fit-record-${day}.png`;
      await sharePng(src, name, `Новый рекорд в Hero Fit: ${exercise} — hero-fit.ru`);
    } catch {
      toast.error("Не удалось подготовить картинку — попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        <ImageIcon />
        Карточка рекорда
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Новый рекорд!</DialogTitle>
            <DialogDescription>
              {exercises.length > 1 ? `${index + 1} из ${exercises.length} · ${exercise}` : exercise}
            </DialogDescription>
          </DialogHeader>
          {/* PNG с сервера (next/og) — next/image тут ни к чему */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={`Карточка рекорда: ${exercise}`}
            width={1080}
            height={1920}
            className="mx-auto aspect-9/16 max-h-[60dvh] w-auto rounded-xl border bg-muted"
          />
          {exercises.length > 1 ? (
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="icon" aria-label="Предыдущий рекорд" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                <ChevronLeft />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {index + 1} / {exercises.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Следующий рекорд"
                disabled={index === exercises.length - 1}
                onClick={() => setIndex((i) => i + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose render={<Button type="button" variant="ghost" />}>Закрыть</DialogClose>
            <Button type="button" onClick={share} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Share2 />}
              Поделиться
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
