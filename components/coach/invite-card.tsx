"use client";

import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Ссылка-приглашение тренера: клиент открывает её и разрешает доступ. */
export function InviteCard({ url, code }: { url: string; code: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована — отправьте её клиенту");
    } catch {
      toast.error("Не удалось скопировать — выделите ссылку вручную");
    }
  };

  return (
    <section aria-label="Пригласить клиента" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Link2 className="size-4 text-primary" />
        Пригласить клиента
      </h2>
      <p className="text-sm text-muted-foreground">
        Отправьте ссылку клиенту. Он увидит, к чему вы получите доступ, и подтвердит — после этого появится в списке.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code data-testid="coach-invite-link" className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 text-sm">
          {url}
        </code>
        <Button type="button" variant="outline" onClick={copy}>
          <Copy />
          Скопировать
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Код приглашения: <span className="font-mono font-semibold text-foreground">{code}</span>
      </p>
    </section>
  );
}
