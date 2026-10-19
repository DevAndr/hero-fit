"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Согласие на обработку данных о здоровье — отдельное, обязательное перед переходом в WHOOP. */
export function ConsentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setAgreed(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключить WHOOP</DialogTitle>
          <DialogDescription>Hero Fit получит из WHOOP данные о здоровье — нужно ваше согласие.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Какие данные:</span> тренировки WHOOP — время, вид спорта, средний и максимальный пульс,
            strain, ккал, время в пульсовых зонах.
          </li>
          <li>
            <span className="text-foreground">Зачем:</span> показ в сводке тренировки.
          </li>
          <li>
            <span className="text-foreground">Кто видит:</span> только вы.
          </li>
          <li>
            <span className="text-foreground">Срок:</span> пока WHOOP подключён.
          </li>
          <li>
            <span className="text-foreground">Как отозвать:</span> кнопка «Отключить WHOOP» — данные удаляются.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Подробнее — в{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4 hover:text-primary">
            политике конфиденциальности
          </Link>
          .
        </p>
        <Field orientation="horizontal">
          <Checkbox id="whoop-consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
          <FieldContent>
            <FieldLabel htmlFor="whoop-consent" className="font-normal">
              Согласен на обработку данных о здоровье
            </FieldLabel>
          </FieldContent>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
          {/* Обычная ссылка, не <Link>: маршрут уводит на авторизацию WHOOP полной навигацией */}
          <a
            href={agreed ? "/api/whoop/connect?consent=1" : undefined}
            role="link"
            aria-disabled={!agreed}
            className={cn(buttonVariants(), !agreed && "pointer-events-none opacity-50")}
          >
            Продолжить
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
