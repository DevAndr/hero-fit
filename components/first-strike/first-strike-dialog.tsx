"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Swords, Trophy } from "lucide-react";
import { BossHpBar } from "@/components/boss/boss-card";
import { BossSprite } from "@/components/boss/boss-sprite";
import { prefersReducedMotion } from "@/components/lottie/lottie-player";
import { FirstWorkout } from "@/components/onboarding/first-workout";
import { XpBar } from "@/components/progress/xp-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import type { BossView } from "@/lib/boss/queries";
import { firstStrikeAction } from "@/lib/first-strike/actions";
import { parseStrike, STRIKE_EXERCISES, type StrikeExercise } from "@/lib/first-strike/rules";
import type { StrikeResult } from "@/lib/first-strike/types";
import { levelProgress } from "@/lib/progress/level";

export type StrikeSuccess = Extract<StrikeResult, { ok: true }>;

/** Экран 1: упражнение и число — один подход без инвентаря. */
function StrikeForm({ boss, onStruck }: { boss: BossView | null; onStruck: (result: StrikeSuccess) => void }) {
  const [exercise, setExercise] = useState<StrikeExercise>(STRIKE_EXERCISES[0].code);
  const [value, setValue] = useState(String(STRIKE_EXERCISES[0].defaultValue));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const def = STRIKE_EXERCISES.find((e) => e.code === exercise) ?? STRIKE_EXERCISES[0];
  const unitLabel = def.unit === "sec" ? "Секунды" : "Повторы";

  const pick = (code: StrikeExercise) => {
    const next = STRIKE_EXERCISES.find((e) => e.code === code);
    if (!next) return;
    setExercise(code);
    setValue(String(next.defaultValue));
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseStrike(exercise, value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await firstStrikeAction({ exercise: parsed.exercise, value: parsed.value });
        if (result.ok) onStruck(result);
        else setError(result.error);
      } catch {
        setError("Не удалось нанести удар — проверь связь и попробуй ещё раз");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {boss ? (
        <div className="flex items-center gap-3 rounded-lg border border-streak/30 bg-streak/5 p-2">
          <BossSprite code={boss.code} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{boss.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {Math.max(0, boss.hp - boss.damage)} / {boss.hp} HP
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p id="first-strike-exercise" className="text-sm font-medium">
          Упражнение
        </p>
        <RadioGroup
          aria-labelledby="first-strike-exercise"
          value={exercise}
          onValueChange={(v) => pick(v as StrikeExercise)}
          disabled={pending}
          className="grid-cols-3"
        >
          {STRIKE_EXERCISES.map((e) => (
            <label
              key={e.code}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center text-sm transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/10"
            >
              <RadioGroupItem value={e.code} aria-label={e.label} />
              {e.label}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="first-strike-value">{unitLabel}</Label>
        <Input
          {...selectOnFocus}
          id="first-strike-value"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "first-strike-error" : undefined}
          className="text-lg font-semibold tabular-nums"
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Swords className="size-4" aria-hidden />}
        Ударить
      </Button>
      {error ? (
        <p id="first-strike-error" role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Экран 2: босс вздрагивает и теряет HP, опыт растёт, ачивка; дальше — к настоящей тренировке. */
function StrikeResultView({
  result,
  onSelf,
  onLater,
}: {
  result: StrikeSuccess;
  onSelf: () => void;
  onLater: () => void;
}) {
  const { boss } = result;
  const left = Math.max(0, boss.hp - boss.damage);
  // Полоса HP съезжает с «до удара» на «после» (переход ширины — в BossHpBar, без движения — сразу)
  const [shownLeft, setShownLeft] = useState(Math.min(boss.hp, left + result.damage));
  const spriteRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLSpanElement>(null);
  const before = levelProgress(result.xpBefore);
  const after = levelProgress(result.xpAfter);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShownLeft(left));
    const animations: Animation[] = [];
    if (!prefersReducedMotion()) {
      const hit = hitRef.current?.animate(
        [
          { opacity: 0, transform: "translateY(6px) scale(0.8)" },
          { opacity: 1, transform: "translateY(-10px) scale(1.15)", offset: 0.3 },
          { opacity: 0, transform: "translateY(-32px) scale(1)" },
        ],
        { duration: 1100, delay: 150, easing: "ease-out", fill: "forwards" },
      );
      const shake = spriteRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-5px) rotate(-7deg)" },
          { transform: "translateX(5px) rotate(7deg)" },
          { transform: "translateX(0)" },
        ],
        { duration: 320, delay: 150 },
      );
      for (const a of [hit, shake]) if (a) animations.push(a);
    }
    return () => {
      cancelAnimationFrame(frame);
      for (const a of animations) a.cancel();
    };
  }, [left]);

  return (
    <div className="space-y-3" data-testid="first-strike-result">
      <div className="flex items-center gap-4 rounded-lg border border-streak/30 bg-streak/5 p-3">
        <div ref={spriteRef} className="relative">
          <BossSprite code={boss.code} defeated={boss.defeatedAt !== null} size={64} />
          <span
            ref={hitRef}
            className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-xl font-black text-streak tabular-nums motion-safe:opacity-0"
          >
            −{result.damage}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate font-bold">{boss.name}</p>
          <BossHpBar hp={boss.hp} left={shownLeft} name={boss.name} />
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">
            {left} / {boss.hp} HP
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-black text-xp tabular-nums">+{result.xp} XP</p>
          <p className="text-xs text-muted-foreground">
            {after.level > before.level ? `Новый уровень ${after.level}!` : `Уровень ${after.level}`}
          </p>
        </div>
        <XpBar level={after.level} percent={after.percent} from={before} size="lg" delay={400} label={`Опыт уровня ${after.level}`} />
      </div>

      {result.achievement ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <Trophy className="size-5 shrink-0 text-xp" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Новая ачивка</p>
            <p className="font-bold">{result.achievement.title}</p>
          </div>
          {result.achievement.xpReward ? (
            <span className="shrink-0 text-sm font-semibold text-xp tabular-nums">+{result.achievement.xpReward} XP</span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 border-t pt-3">
        <p className="text-sm text-muted-foreground">Настоящая тренировка бьёт сильнее: каждый подход — ещё {result.damage} урона</p>
        {/* Без черновика диалог закрывает «Не сейчас» из FirstWorkout — своей кнопки «Позже» нет */}
        {result.hasDraft ? (
          <>
            <Link href="/training" className={buttonVariants({ size: "lg", className: "w-full" })}>
              Продолжить черновик
            </Link>
            <Button type="button" variant="ghost" className="w-full" onClick={onLater}>
              Позже
            </Button>
          </>
        ) : (
          <FirstWorkout programs={result.programs} disabled={false} onSelf={onSelf} onLater={onLater} />
        )}
      </div>
    </div>
  );
}

/** Диалог «Первый удар»: экран удара, после удачного удара — экран результата. Состояние держит хост. */
export function FirstStrikeDialog({
  open,
  boss,
  result,
  onStruck,
  onClose,
  onSelf,
}: {
  open: boolean;
  boss: BossView | null;
  result: StrikeSuccess | null;
  onStruck: (result: StrikeSuccess) => void;
  onClose: () => void;
  onSelf: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" data-testid="first-strike-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Первый удар</DialogTitle>
          <DialogDescription>
            {result ? "Удар засчитан — босс почувствовал тебя" : "Сделай один подход прямо сейчас — и босс получит первый удар"}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <StrikeResultView result={result} onSelf={onSelf} onLater={onClose} />
        ) : (
          <StrikeForm boss={boss} onStruck={onStruck} />
        )}
      </DialogContent>
    </Dialog>
  );
}
