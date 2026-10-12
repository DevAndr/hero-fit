"use client";

import { useMemo, useState } from "react";
import { Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { renderSVG } from "uqr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** QR со ссылкой-приглашением — рисуется в браузере, без внешних сервисов. Тёмные модули на белом: так сканируется в любой теме. */
export function InviteQr({ url, size = 200 }: { url: string; size?: number }) {
  const svg = useMemo(() => renderSVG(url, { border: 2, whiteColor: "#ffffff", blackColor: "#000000" }), [url]);
  return (
    <div
      role="img"
      aria-label="QR-код ссылки-приглашения"
      className="overflow-hidden rounded-lg bg-white [&>svg]:block [&>svg]:size-full"
      style={{ width: size, height: size }}
      // SVG строит uqr из нашей же ссылки
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** «Пригласить»: ссылка, «Копировать» и QR (распечатать на ресепшен). */
export function InviteButton({ url, clubName }: { url: string; clubName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <QrCode />
        Пригласить
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Пригласить в клуб</DialogTitle>
            <DialogDescription>Ссылка или QR ведут на вступление в «{clubName}».</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <InviteQr url={url} />
          </div>
          <div className="flex gap-2">
            <Input aria-label="Ссылка" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Копировать ссылку"
              onClick={() =>
                navigator.clipboard?.writeText(url).then(
                  () => toast.success("Ссылка скопирована"),
                  () => toast.error("Не удалось скопировать"),
                )
              }
            >
              <Copy />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
