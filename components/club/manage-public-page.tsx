"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClubStatus } from "@/generated/prisma/enums";
import { publishClubPageAction, saveClubAboutAction, unpublishClubPageAction } from "@/lib/club/actions";
import { canPublish, CLUB_ABOUT_MAX } from "@/lib/club/public";

/** Раздел «Публичная страница» в управлении клубом: «О зале», публикация и адрес страницы. */
export function ManagePublicPage({
  clubId,
  status,
  about,
  published,
  url,
  flagFull,
}: {
  clubId: string;
  status: ClubStatus;
  about: string;
  published: boolean;
  /** Полный адрес страницы — если публиковалась хоть раз. */
  url: string | null;
  flagFull: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(about);
  // Публикуется сохранённый текст — причина считается по нему, а не по черновику в поле
  const [saved, setSaved] = useState(about);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const block = canPublish({ status, about: saved });

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setError(null);
      after?.();
      toast.success(done);
      router.refresh();
    });

  return (
    <section id="public" aria-label="Публичная страница" className="scroll-mt-20 space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-bold">Публичная страница</h2>
      <p className="text-sm text-muted-foreground">
        Страница зала для поиска и соцсетей: адрес, «О зале», общие цифры клуба без имён и активные задания.
      </p>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="club-about">О зале</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {text.length} / {CLUB_ABOUT_MAX}
          </span>
        </div>
        <Textarea id="club-about" rows={5} maxLength={CLUB_ABOUT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          variant="outline"
          size="sm"
          disabled={pending || text === saved}
          onClick={() =>
            run(() => saveClubAboutAction(clubId, text), "Сохранено", () => {
              // Сервер сохраняет без пробелов по краям — поле тоже, иначе «Сохранить» не погаснет
              setText(text.trim());
              setSaved(text.trim());
            })
          }
        >
          Сохранить
        </Button>
      </div>

      {published && url ? (
        <div className="space-y-2">
          <Input aria-label="Адрес страницы" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"), () => undefined)}
            >
              Скопировать
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm text-primary hover:underline">
              Открыть страницу
            </a>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => unpublishClubPageAction(clubId), "Страница снята с публикации")}>
              Снять с публикации
            </Button>
          </div>
          {!flagFull ? <p className="text-sm text-muted-foreground">Страница появится в поиске, когда клубы откроются для всех</p> : null}
        </div>
      ) : (
        <div className="space-y-1">
          <Button size="sm" disabled={pending || Boolean(block)} onClick={() => run(() => publishClubPageAction(clubId), "Страница опубликована")}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Опубликовать
          </Button>
          {block ? <p className="text-sm text-muted-foreground">{block}</p> : null}
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
