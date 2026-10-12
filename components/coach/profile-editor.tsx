"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants, Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { publishCoachProfileAction, saveCoachProfileAction } from "@/lib/coach/profile-actions";
import {
  FORMAT_LABELS,
  FORMATS,
  MAX_SPECIALTIES,
  MIN_CLIENTS_FOR_STATS,
  SPECIALTIES,
  STAT_CODES,
  type StatCode,
} from "@/lib/coach/profile";

type Format = (typeof FORMATS)[number];
export type ProfileForm = {
  displayName: string;
  city: string;
  format: Format;
  specialties: string[];
  about: string;
  hiddenStats: StatCode[];
  showAwards: boolean;
};

const STAT_TITLES: Record<StatCode, string> = {
  clients: "Число клиентов",
  workouts: "Тренировки клиентов за 30 дней",
  records: "Рекорды клиентов за 30 дней",
  plan: "Доля выполненного плана",
  since: "С какого времени в Hero Fit",
};

/** Редактор публичной страницы тренера: поля, какие цифры показывать, публикация. */
export function ProfileEditor({
  initial,
  published,
  url,
  stats,
}: {
  initial: ProfileForm;
  published: boolean;
  url: string | null;
  /** Текущее значение каждой цифры или почему её пока нет на странице. */
  stats: Record<StatCode, string>;
}) {
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<ProfileForm>) => setForm((f) => ({ ...f, ...patch }));
  const toggleSpecialty = (code: string, on: boolean) =>
    set({ specialties: on ? [...form.specialties, code] : form.specialties.filter((c) => c !== code) });
  const toggleStat = (code: StatCode, show: boolean) =>
    set({ hiddenStats: show ? form.hiddenStats.filter((c) => c !== code) : [...form.hiddenStats, code] });

  const save = () =>
    startTransition(async () => {
      const result = await saveCoachProfileAction(form);
      if (result.ok) toast.success("Сохранено");
      else toast.error(result.error);
    });
  const publish = (on: boolean) =>
    startTransition(async () => {
      const saved = await saveCoachProfileAction(form);
      if (!saved.ok) return void toast.error(saved.error);
      const result = await publishCoachProfileAction(on);
      if (result.ok) toast.success(on ? "Страница опубликована" : "Страница снята с публикации");
      else toast.error(result.error);
    });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Публикация">
        {published && url ? (
          <>
            <p className="text-sm">
              Ваша страница: <span className="font-medium break-all">{url}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"))}
              >
                <Copy />
                Скопировать
              </Button>
              <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                <ExternalLink />
                Открыть
              </a>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => publish(false)}>
                Снять с публикации
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Смена ника в настройках изменит адрес страницы.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Страница не опубликована. После публикации её увидят все, в том числе поисковые системы.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => publish(true)}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Опубликовать
              </Button>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
                  <ExternalLink />
                  Предпросмотр
                </a>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="О тренере">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="profile-name">Имя на странице</Label>
            <Input id="profile-name" value={form.displayName} maxLength={50} placeholder="Без имени — ник" onChange={(e) => set({ displayName: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="profile-city">Город</Label>
            <Input id="profile-city" value={form.city} maxLength={50} onChange={(e) => set({ city: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-format">Формат</Label>
          <Select
            items={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
            value={form.format}
            onValueChange={(v: Format | null) => v && set({ format: v })}
          >
            <SelectTrigger id="profile-format" aria-label="Формат" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Специализации (до {MAX_SPECIALTIES})</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(SPECIALTIES).map(([code, label]) => {
              const checked = form.specialties.includes(code);
              return (
                <label key={code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={!checked && form.specialties.length >= MAX_SPECIALTIES}
                    onCheckedChange={(v) => toggleSpecialty(code, v === true)}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-about">О себе</Label>
          <Textarea
            id="profile-about"
            value={form.about}
            maxLength={1000}
            rows={6}
            placeholder="Опыт, подход, с кем работаете, чего добиваются клиенты"
            onChange={(e) => set({ about: e.target.value })}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">{form.about.length} / 1000</p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Цифры на странице">
        <h2 className="font-bold">Цифры на странице</h2>
        <p className="text-sm text-muted-foreground">
          Считаются сами по тренировкам клиентов, без имён. Цифры по клиентам появляются от {MIN_CLIENTS_FOR_STATS} клиентов.
        </p>
        <ul className="divide-y divide-border/60">
          {STAT_CODES.map((code) => (
            <li key={code} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">
                {STAT_TITLES[code]}
                <span className="block text-xs text-muted-foreground">{stats[code]}</span>
              </span>
              <Switch
                aria-label={`Показывать: ${STAT_TITLES[code]}`}
                checked={!form.hiddenStats.includes(code)}
                onCheckedChange={(v) => toggleStat(code, v)}
              />
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm">
              Показывать награды
              <span className="block text-xs text-muted-foreground">Тренерские ачивки — за клиентов, разборы и их результаты</span>
            </span>
            <Switch aria-label="Показывать награды" checked={form.showAwards} onCheckedChange={(v) => set({ showAwards: v })} />
          </li>
        </ul>
      </section>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Сохранить
      </Button>
    </form>
  );
}
