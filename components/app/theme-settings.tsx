"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Monitor, Moon, Palette, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const THEMES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
  { value: "system", label: "Системная", icon: Monitor },
];

const noopSubscribe = () => () => {};

/** Надетый скин (тема магазина со своим режимом): он важнее выбора здесь, пока надет. */
export type WornSkin = { name: string; mode: "dark" | "light" } | null;

function SkinNote({ skin }: { skin: WornSkin | undefined }) {
  if (!skin) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Сейчас надета тема «{skin.name}» — она всегда {skin.mode === "dark" ? "тёмная" : "светлая"}. Снять —{" "}
      <Link href="/shop?tab=theme" className="text-primary hover:underline">
        в магазине
      </Link>
    </p>
  );
}

export function ThemeSettings({ skin }: { skin?: WornSkin }) {
  const { theme, setTheme } = useTheme();
  // Выбранная тема известна только в браузере (localStorage) — до гидрации ничего не отмечаем.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return (
    <section aria-label="Оформление" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Palette className="size-4 text-primary" />
        Оформление
      </h2>
      <SkinNote skin={skin} />
      <RadioGroup
        aria-label="Тема"
        value={mounted ? theme : null}
        onValueChange={(value) => setTheme(value as string)}
        className="grid-cols-3"
      >
        {THEMES.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/10"
          >
            <Icon className="size-5" />
            <span className="flex items-center gap-2">
              <RadioGroupItem value={value} aria-label={label} />
              {label}
            </span>
          </label>
        ))}
      </RadioGroup>
    </section>
  );
}

/** В Telegram Mini App тема следует схеме Telegram (TelegramMiniApp) — выбирать нечего. */
export function TelegramThemeNote({ skin }: { skin?: WornSkin }) {
  return (
    <section aria-label="Оформление" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Palette className="size-4 text-primary" />
        Оформление
      </h2>
      {skin ? <SkinNote skin={skin} /> : <p className="text-sm text-muted-foreground">Тема — как в Telegram</p>}
    </section>
  );
}
