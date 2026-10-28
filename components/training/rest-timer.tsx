"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { Bell, BellOff, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePush } from "@/components/notifications/push-provider";
import { useTelegram } from "@/components/telegram/telegram-mini-app";
import { formatClock } from "@/lib/format";
import { cancelRestPushAction, scheduleRestPushAction } from "@/lib/notifications/actions";
import { readNotificationPermission, subscribeErrorText } from "@/lib/notifications/subscribe-error";
import { haptic } from "@/lib/telegram/webapp";
import { cn } from "@/lib/utils";

/**
 * Таймер отдыха. Источник правды — момент окончания (endsAt), а не счётчик тиков:
 * браузер может замедлять таймеры в фоне, но оставшееся время всегда считается от часов.
 * Тики идут из Web Worker — его таймеры троттлятся меньше, чем на главном потоке.
 */
type Rest = { endsAt: number; total: number; label: string };

type RestTimerApi = {
  rest: Rest | null;
  remaining: number;
  start: (seconds: number, label: string) => void;
  adjust: (deltaSec: number) => void;
  skip: () => void;
};

const RestTimerContext = createContext<RestTimerApi | null>(null);
const STORAGE_KEY = "hf-rest-timer";

export function useRestTimer() {
  const api = useContext(RestTimerContext);
  if (!api) throw new Error("useRestTimer must be used inside <RestTimerProvider>");
  return api;
}

/** Тики раз в 250 мс из Web Worker (в фоне троттлятся меньше); возвращает остановку. Им же идёт отсчёт «Держать». */
export function createTicker(onTick: () => void) {
  try {
    const source = "let id;onmessage=e=>{clearInterval(id);if(e.data==='start')id=setInterval(()=>postMessage(0),250)}";
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
    worker.onmessage = onTick;
    worker.postMessage("start");
    return () => worker.terminate();
  } catch {
    const id = window.setInterval(onTick, 250);
    return () => window.clearInterval(id);
  }
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* звук недоступен — не критично */
  }
}

/** Сигнал конца отсчёта: вибрация + звук + уведомление, если вкладка в фоне (отдых и «Держать» у растяжки). */
export function signalTimerEnd(title: string, body: string, tag = "hero-fit-rest") {
  navigator.vibrate?.([300, 150, 300]);
  // В Telegram (и на iOS, где navigator.vibrate нет) — вибрация Telegram
  haptic("warning");
  playBeep();
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
    new Notification(title, { body, tag });
  }
}

const notifyDone = (label: string) => signalTimerEnd("Отдых окончен 💪", `Следующий подход: ${label}`);

function readStored(): Rest | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const rest = raw ? (JSON.parse(raw) as Rest) : null;
    return rest && rest.endsAt > Date.now() ? rest : null;
  } catch {
    return null;
  }
}

function store(rest: Rest | null) {
  try {
    if (rest) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* приватный режим — таймер просто не переживёт перезагрузку */
  }
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const restRef = useRef(rest);
  const push = usePush();
  const pushOn = Boolean(push?.subscribed);
  const scheduledRef = useRef<Rest | null>(null);

  // Push в конце отдыха: дойдёт даже при заблокированном экране, когда страница «заморожена».
  // На видимой странице SW его не покажет — здесь уже пропищал локальный сигнал.
  useEffect(() => {
    const prev = scheduledRef.current;
    scheduledRef.current = rest;
    if (!pushOn) return;
    if (rest && rest.endsAt !== prev?.endsAt) {
      void scheduleRestPushAction(new Date(rest.endsAt).toISOString(), rest.label).catch(() => {});
    } else if (!rest && prev) {
      void cancelRestPushAction().catch(() => {});
    }
  }, [rest, pushOn]);

  // Восстанавливаем таймер после перезагрузки. Только после монтирования: sessionStorage
  // нет на сервере, а чтение при первом рендере дало бы рассинхрон гидрации.
  useEffect(() => {
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразовая синхронизация с внешним хранилищем
    if (stored) setRest(stored);
  }, []);

  useEffect(() => {
    restRef.current = rest;
    store(rest);
    if (!rest) return;
    return createTicker(() => {
      const current = restRef.current;
      setNow(Date.now());
      if (current && Date.now() >= current.endsAt) {
        restRef.current = null;
        setRest(null);
        notifyDone(current.label);
      }
    });
  }, [rest]);

  const start = useCallback((seconds: number, label: string) => {
    if (seconds <= 0) return;
    setNow(Date.now());
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds, label });
  }, []);

  const adjust = useCallback((deltaSec: number) => {
    setRest((r) => {
      if (!r) return r;
      const endsAt = r.endsAt + deltaSec * 1000;
      return endsAt <= Date.now() ? null : { ...r, endsAt, total: Math.max(r.total + deltaSec, 1) };
    });
  }, []);

  const skip = useCallback(() => setRest(null), []);

  const api = useMemo<RestTimerApi>(
    () => ({ rest, remaining: rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0, start, adjust, skip }),
    [rest, now, start, adjust, skip],
  );

  return <RestTimerContext.Provider value={api}>{children}</RestTimerContext.Provider>;
}

/** Пока таймер на экране, под контентом нужно место, чтобы панель не перекрывала последние кнопки. */
export function RestTimerSpacer() {
  const { rest } = useRestTimer();
  return rest ? <div aria-hidden className="h-28" /> : null;
}

/** Плавающая панель над нижней навигацией. */
export function RestTimerBar() {
  const { rest } = useRestTimer();
  return rest ? <RestTimerPanel /> : null;
}

/**
 * Сколько места снизу занимает таймер — CSS-переменная `--rest-timer-clear` (от нижнего края экрана до верха
 * таймера с зазором): кнопка и чат помощника поднимаются над ним, а не перекрывают.
 */
function useBottomClearance(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--rest-timer-clear", `${Math.round(window.innerHeight - el.getBoundingClientRect().top + 12)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--rest-timer-clear");
    };
  }, [ref]);
}

function RestTimerPanel() {
  const { rest, remaining, adjust, skip } = useRestTimer();
  const ref = useRef<HTMLDivElement>(null);
  useBottomClearance(ref);
  if (!rest) return null;
  const progress = Math.min(100, (remaining / rest.total) * 100);

  return (
    <div
      ref={ref}
      role="timer"
      aria-label="Таймер отдыха"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+var(--tg-safe-bottom))] z-40 mx-auto max-w-md overflow-hidden rounded-2xl border bg-popover shadow-2xl lg:bottom-6"
    >
      <div className="h-1 bg-muted">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center gap-3 p-3">
        <Timer className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-black tabular-nums" data-testid="rest-remaining">
            {formatClock(remaining)}
          </p>
          <p className="truncate text-xs text-muted-foreground">Отдых · далее {rest.label}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => adjust(-15)} aria-label="Минус 15 секунд">
          −15
        </Button>
        <Button variant="outline" size="sm" onClick={() => adjust(15)} aria-label="Плюс 15 секунд">
          +15
        </Button>
        <Button size="sm" onClick={skip} aria-label="Пропустить отдых">
          <SkipForward />
        </Button>
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Включить уведомления об окончании отдыха: Web Push, а где его нет — системные уведомления вкладки. */
export function NotificationToggle({ className }: { className?: string }) {
  const push = usePush();
  const { inTelegram } = useTelegram();
  const browserPermission = useSyncExternalStore(noopSubscribe, readNotificationPermission, () => "default" as const);
  const [requested, setPermission] = useState<NotificationPermission | null>(null);
  const permission: NotificationPermission | "unsupported" = requested ?? browserPermission;

  // Во webview Telegram ни Web Push, ни уведомления вкладки не работают — сигнал придёт вибрацией
  if (inTelegram) return null;

  if (push?.supported && push.available) {
    if (!push.ready || push.subscribed) return null;
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("text-muted-foreground", className)}
        disabled={push.busy || push.permission === "denied"}
        title={push.permission === "denied" ? "Уведомления запрещены в настройках браузера" : undefined}
        onClick={async () => {
          const ok = await push.subscribe();
          if (ok) toast.success("Push включён — сигнал придёт и при заблокированном экране");
          else toast.error(subscribeErrorText({ native: push.native, nativeReason: push.nativeReason, permission: readNotificationPermission() }));
        }}
      >
        {push.permission === "denied" ? <BellOff /> : <Bell />}
        {push.permission === "denied" ? "Уведомления выключены" : "Уведомлять об отдыхе"}
      </Button>
    );
  }

  if (permission === "unsupported" || permission === "granted") return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground", className)}
      disabled={permission === "denied"}
      onClick={async () => setPermission(await Notification.requestPermission())}
    >
      {permission === "denied" ? <BellOff /> : <Bell />}
      {permission === "denied" ? "Уведомления выключены" : "Уведомлять об отдыхе"}
    </Button>
  );
}
