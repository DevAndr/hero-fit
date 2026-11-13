"use client";

import { useOptimistic, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Meal } from "@/generated/prisma/enums";
import { MEAL_LABELS, MEALS } from "@/lib/nutrition/diary";
import { addMealReminderAction, deleteMealReminderAction, updateMealReminderAction, type MealReminderResult } from "@/lib/nutrition/reminder-actions";
import { formatTime, MAX_MEAL_REMINDERS, nextDefault, parseTime } from "@/lib/nutrition/reminders";
import type { MealReminderView } from "@/lib/nutrition/reminder-queries";

type Patch = { meal?: Meal; minutes?: number; enabled?: boolean };
type Change = { type: "patch"; id: string; patch: Patch } | { type: "remove"; id: string };

const NETWORK_ERROR = "Не удалось сохранить — проверьте связь";
const MEAL_ITEMS = MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }));

function applyChange(list: MealReminderView[], change: Change): MealReminderView[] {
  if (change.type === "remove") return list.filter((r) => r.id !== change.id);
  return list.map((r) => (r.id === change.id ? { ...r, ...change.patch } : r)).sort((a, b) => a.minutes - b.minutes);
}

/**
 * «Напоминания о приёмах пищи» (из меню «⋮» в «Итоге дня»): до шести строк «время · приём · переключатель · удалить».
 * Изменения и удаление применяются сразу (оптимистично, при ошибке откатываются и показывают причину), добавление — после
 * ответа сервера. Время сохраняется при уходе фокуса: пустое или неполное поле возвращается к прежнему значению.
 */
export function MealRemindersDialog({
  open,
  onOpenChange,
  reminders,
  canPush,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminders: MealReminderView[];
  /** есть куда слать сам push (подписка или Telegram); нет — подсказка про уведомления */
  canPush: boolean;
}) {
  const router = useRouter();
  const [list, change] = useOptimistic(reminders, applyChange);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  /** Выполняет действие; ошибка сервера и сбой сети — тост, список возвращается к данным сервера. */
  const run = (action: () => Promise<MealReminderResult>, optimistic?: Change, afterRemove = false) =>
    start(async () => {
      if (optimistic) change(optimistic);
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          router.refresh();
        }
      } catch {
        toast.error(NETWORK_ERROR);
      }
      // Фокус не должен пропасть вместе с удалённой строкой — переносим на ближайшее поле списка
      if (afterRemove) setTimeout(() => (listRef.current?.querySelector<HTMLElement>("input, button") ?? listRef.current)?.focus(), 0);
    });

  const full = list.length >= MAX_MEAL_REMINDERS;
  const add = () => {
    const next = nextDefault(list);
    if (next) run(() => addMealReminderAction(next));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Напоминания о приёмах пищи</DialogTitle>
          <DialogDescription>Придёт в выбранное время, если приём ещё не записан</DialogDescription>
        </DialogHeader>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Напоминаний пока нет</p>
        ) : null}
        <ul ref={listRef} tabIndex={-1} className="space-y-2 outline-none">
          {list.map((r) => (
            <li key={r.id}>
              <ReminderRow
                reminder={r}
                onPatch={(patch) => run(() => updateMealReminderAction(r.id, patch), { type: "patch", id: r.id, patch })}
                onRemove={() => run(() => deleteMealReminderAction(r.id), { type: "remove", id: r.id }, true)}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={add} disabled={full || pending}>
            <Plus />
            Добавить напоминание
          </Button>
          {full ? <p className="text-sm text-muted-foreground">Не больше {MAX_MEAL_REMINDERS} напоминаний</p> : null}
        </div>
        {canPush ? null : (
          <p className="text-sm text-muted-foreground">
            Чтобы напоминания приходили на телефон,{" "}
            <Link href="/settings" className="text-primary underline underline-offset-2">
              включите уведомления
            </Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReminderRow({ reminder, onPatch, onRemove }: { reminder: MealReminderView; onPatch: (patch: Patch) => void; onRemove: () => void }) {
  const time = formatTime(reminder.minutes);
  /** Сохраняем только корректное и изменённое время; иначе поле возвращается к прежнему значению. */
  const commitTime = (input: HTMLInputElement) => {
    const minutes = parseTime(input.value);
    if (minutes === null || minutes === reminder.minutes) {
      input.value = time;
      return;
    }
    onPatch({ minutes });
  };
  return (
    <div className="flex items-center gap-2">
      {/* key: при смене или откате времени поле пересоздаётся с актуальным значением */}
      <Input
        key={reminder.minutes}
        type="time"
        aria-label="Время напоминания"
        defaultValue={time}
        onBlur={(e) => commitTime(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-28 shrink-0"
      />
      <Select items={MEAL_ITEMS} value={reminder.meal} onValueChange={(next: Meal | null) => next && next !== reminder.meal && onPatch({ meal: next })}>
        <SelectTrigger aria-label="Приём пищи" className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEAL_ITEMS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Switch checked={reminder.enabled} onCheckedChange={(enabled) => onPatch({ enabled })} aria-label={`Напоминание ${time} включено`} />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Удалить напоминание ${time}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}
