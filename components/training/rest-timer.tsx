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
} from "react";
import { Bell, BellOff, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
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

function createTicker(onTick: () => void) {
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

function notifyDone(label: string) {
  navigator.vibrate?.([300, 150, 300]);
  playBeep();
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
    new Notification("Отдых окончен 💪", { body: `Следующий подход: ${label}`, tag: "hero-fit-rest" });
  }
}

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
  const { rest, remaining, adjust, skip } = useRestTimer();
  if (!rest) return null;
  const progress = Math.min(100, (remaining / rest.total) * 100);

  return (
    <div
      role="timer"
      aria-label="Таймер отдыха"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md overflow-hidden rounded-2xl border bg-popover shadow-2xl lg:bottom-6"
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

/** Кнопка запроса разрешения на системные уведомления (нужны, когда вкладка в фоне). */
const noopSubscribe = () => () => {};
const readPermission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export function NotificationToggle({ className }: { className?: string }) {
  const browserPermission = useSyncExternalStore(noopSubscribe, readPermission, () => "default" as const);
  const [requested, setPermission] = useState<NotificationPermission | null>(null);
  const permission = requested ?? browserPermission;

  if (permission === "unsupported" || permission === "granted") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground", className)}
      disabled={permission === "denied"}
      title={permission === "denied" ? "Уведомления запрещены в настройках браузера" : undefined}
      onClick={async () => setPermission(await Notification.requestPermission())}
    >
      {permission === "denied" ? <BellOff /> : <Bell />}
      {permission === "denied" ? "Уведомления выключены" : "Уведомлять об отдыхе"}
    </Button>
  );
}
