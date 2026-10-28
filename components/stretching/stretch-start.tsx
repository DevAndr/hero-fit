"use client";

import Link from "next/link";
import { useState } from "react";
import { Play, Plus, StretchHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createWorkoutAction } from "@/lib/workouts/actions";
import type { StretchTemplate } from "@/lib/stretching/queries";

/** «Начать растяжку»: готовая программа, свой шаблон или пустая тренировка; идёт тренировка — «Продолжить». */
export function StretchStart({ templates, active }: { templates: StretchTemplate[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  if (active) {
    return (
      <Link href="/training" className={buttonVariants({ size: "lg" })}>
        <Play />
        Продолжить тренировку
      </Link>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" />}>
        <StretchHorizontal />
        Начать растяжку
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Начать растяжку</DialogTitle>
          <DialogDescription>Выберите программу или соберите сессию сами.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {templates.map((t) => (
            <form key={t.id} action={createWorkoutAction} className="flex items-center gap-3 rounded-lg border p-3">
              <input type="hidden" name="source" value={`template:${t.id}`} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {t.name}
                  {t.own ? <span className="ml-2 text-xs font-normal text-primary">моё</span> : null}
                </p>
                {t.description ? <p className="text-sm text-muted-foreground">{t.description}</p> : null}
              </div>
              <Button type="submit" variant="secondary" aria-label={`Начать «${t.name}»`}>
                <Play />
                Начать
              </Button>
            </form>
          ))}
          <form action={createWorkoutAction}>
            <input type="hidden" name="source" value="empty" />
            <Button type="submit" variant="outline" className="w-full">
              <Plus />
              Пустая — выберу упражнения
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
