"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AlertView } from "@/lib/alerts/rules";
import { cn } from "@/lib/utils";
import { AlertCta, TONE_ICON, TONE_TEXT } from "./alert-style";

/** Попап оповещения: закрытие любым способом (Esc, фон, «Понятно», кнопка-ссылка) — dismiss. */
export function AlertPopup({ alert, open, onDismiss }: { alert: AlertView; open: boolean; onDismiss?: () => void }) {
  const Icon = TONE_ICON[alert.tone];
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onDismiss?.())}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("size-5 shrink-0", TONE_TEXT[alert.tone])} aria-hidden />
            {alert.title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">{alert.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <AlertCta alert={alert} size="default" onClick={onDismiss} />
          <Button onClick={onDismiss}>Понятно</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
