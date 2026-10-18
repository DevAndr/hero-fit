"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { saveAlertAction } from "@/lib/alerts/admin-actions";
import type { AlertDismiss, AlertKind, AlertTone, AlertView } from "@/lib/alerts/rules";
import { BODY_MAX, CTA_LABEL_MAX, TITLE_MAX } from "@/lib/alerts/schema";
import { cn } from "@/lib/utils";
import { AlertBanner } from "../alert-banner";
import { AlertCta, TONE_ICON, TONE_TEXT } from "../alert-style";

/** Поля формы; время — строки datetime-local в поясе браузера. */
export type AlertDraft = {
  kind: AlertKind;
  tone: AlertTone;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  dismiss: AlertDismiss;
  startsAt: string;
  endsAt: string;
};

const KINDS: { value: AlertKind; label: string }[] = [
  { value: "BANNER", label: "Бегущая строка" },
  { value: "POPUP", label: "Попап" },
];
const TONES: { value: AlertTone; label: string }[] = [
  { value: "INFO", label: "Инфо" },
  { value: "WARNING", label: "Важно" },
  { value: "CRITICAL", label: "Критично" },
];
const DISMISS: { value: AlertDismiss; label: string }[] = [
  { value: "NEVER", label: "Нельзя закрыть" },
  { value: "SESSION", label: "Можно закрыть до следующего захода" },
  { value: "FOREVER", label: "Можно закрыть навсегда" },
];

/** Date → значение datetime-local в поясе браузера. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local (пояс браузера) → ISO; пустое или битое — "" (сервер ответит ошибкой). */
function toIso(local: string): string {
  const ms = local ? new Date(local).getTime() : NaN;
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

export function emptyDraft(): AlertDraft {
  return { kind: "BANNER", tone: "INFO", title: "", body: "", ctaLabel: "", ctaHref: "", dismiss: "FOREVER", startsAt: toLocalInput(new Date()), endsAt: "" };
}

function Choice<T extends string>({ name, items, value, onChange }: { name: string; items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{name}</legend>
      <RadioGroup aria-label={name} value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((i) => (
          <label key={i.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <RadioGroupItem value={i.value} aria-label={i.label} />
            {i.label}
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

/** Превью: строка — настоящим компонентом без действий; попап — его содержимое карточкой (диалог в диалоге не открываем). */
function Preview({ draft }: { draft: AlertDraft }) {
  const view: AlertView = {
    id: "preview",
    kind: draft.kind,
    tone: draft.tone,
    title: draft.title || "Заголовок",
    body: draft.body || "Текст оповещения",
    ctaLabel: draft.ctaLabel || null,
    ctaHref: draft.ctaLabel ? draft.ctaHref || "/" : null,
    dismiss: draft.dismiss,
    startsAt: new Date().toISOString(),
    endsAt: null,
  };
  const Icon = TONE_ICON[view.tone];
  return (
    <section aria-label="Превью" className="space-y-1.5">
      <p className="text-sm font-medium">Превью</p>
      <div inert className="overflow-hidden rounded-lg border">
        {view.kind === "BANNER" ? (
          <AlertBanner alert={view} />
        ) : (
          <div className="space-y-3 bg-popover p-4 text-sm text-popover-foreground">
            <p className="flex items-center gap-2 font-medium">
              <Icon className={cn("size-5 shrink-0", TONE_TEXT[view.tone])} aria-hidden />
              {view.title}
            </p>
            <p className="whitespace-pre-line text-muted-foreground">{view.body}</p>
            <div className="flex justify-end gap-2">
              <AlertCta alert={view} size="default" />
              <Button>Понятно</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Создание и правка оповещения в диалоге. */
export function AlertEditor({ id, initial, open, onOpenChange }: { id: string | null; initial: AlertDraft; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof AlertDraft>(key: K, value: AlertDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      const r = await saveAlertAction(id, { ...draft, startsAt: toIso(draft.startsAt), endsAt: toIso(draft.endsAt) });
      if (!r.ok) return void setError(r.error);
      setError(null);
      toast.success("Оповещение сохранено");
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{id ? "Изменить оповещение" : "Новое оповещение"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Choice
            name="Вид"
            items={KINDS}
            value={draft.kind}
            // У попапа «нельзя закрыть» нет: заблокировал бы приложение
            onChange={(kind) => setDraft((d) => ({ ...d, kind, dismiss: kind === "POPUP" && d.dismiss === "NEVER" ? "FOREVER" : d.dismiss }))}
          />
          <Choice name="Тон" items={TONES} value={draft.tone} onChange={(v) => set("tone", v)} />
          {draft.kind === "POPUP" ? (
            <div className="space-y-1.5">
              <Label htmlFor="alert-title">Заголовок</Label>
              <Input id="alert-title" maxLength={TITLE_MAX} value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label htmlFor="alert-body">Текст</Label>
              <span className="text-xs text-muted-foreground">
                {draft.body.length}/{BODY_MAX}
              </span>
            </div>
            <Textarea id="alert-body" rows={3} maxLength={BODY_MAX} value={draft.body} onChange={(e) => set("body", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="alert-cta-label">Подпись кнопки</Label>
              <Input id="alert-cta-label" placeholder="Подробнее" maxLength={CTA_LABEL_MAX} value={draft.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-cta-href">Ссылка кнопки</Label>
              <Input id="alert-cta-href" placeholder="/whats-new или https://…" value={draft.ctaHref} onChange={(e) => set("ctaHref", e.target.value)} />
            </div>
          </div>
          <Choice name="Закрытие" items={draft.kind === "POPUP" ? DISMISS.filter((d) => d.value !== "NEVER") : DISMISS} value={draft.dismiss} onChange={(v) => set("dismiss", v)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="alert-starts">Начало показа</Label>
              <Input id="alert-starts" type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-ends">Конец показа (необязательно)</Label>
              <Input id="alert-ends" type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            </div>
          </div>
          <Preview draft={draft} />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
