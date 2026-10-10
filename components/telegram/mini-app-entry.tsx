"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";

type WebApp = { initData?: string; ready?: () => void; expand?: () => void; requestWriteAccess?: (cb?: (ok: boolean) => void) => void };
type Answer = { status: "ok"; to: string } | { status: "new"; firstName: string } | { error: string };
type Screen = { kind: "loading" } | { kind: "error" } | { kind: "new"; firstName: string } | { kind: "link"; firstName: string };

const webApp = () => (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;

async function auth(payload: Record<string, unknown>): Promise<Answer> {
  const res = await fetch("/api/telegram/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: webApp()?.initData ?? "", ...payload }),
  });
  return (await res.json().catch(() => ({ error: "network" }))) as Answer;
}

/** Разрешение боту писать — для уведомлений; ответа Telegram ждём не дольше 3 с. */
function askWriteAccess() {
  return new Promise<void>((resolve) => {
    const request = webApp()?.requestWriteAccess;
    if (!request) return resolve();
    const timer = setTimeout(resolve, 3000);
    request(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Точка входа Telegram Mini App: вход по initData, регистрация с согласием или привязка существующего аккаунта. */
export function MiniAppEntry() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (to: string) => window.location.replace(to);

  useEffect(() => {
    const app = webApp();
    if (!app?.initData) return go("/login");
    app.ready?.();
    app.expand?.();
    void auth({ action: "auto" }).then((a) => {
      if ("status" in a && a.status === "ok") go(a.to);
      else if ("status" in a && a.status === "new") setScreen({ kind: "new", firstName: a.firstName });
      else setScreen({ kind: "error" });
    });
  }, []);

  const register = async () => {
    setPending(true);
    const a = await auth({ action: "register", consent: true });
    if ("status" in a && a.status === "ok") {
      await askWriteAccess();
      return go(a.to);
    }
    setPending(false);
    setScreen({ kind: "error" });
  };

  const link = async (form: FormData) => {
    setPending(true);
    setError(null);
    const a = await auth({ action: "link", identifier: String(form.get("identifier") ?? ""), password: String(form.get("password") ?? "") });
    if ("status" in a && a.status === "ok") return go(a.to);
    setPending(false);
    if ("error" in a && a.error === "credentials") setError("Неверный логин или пароль");
    else if ("error" in a && a.error === "request") setError("Введите логин и пароль");
    else setScreen({ kind: "error" });
  };

  if (screen.kind === "loading") {
    return (
      <p className="flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Входим через Telegram…
      </p>
    );
  }
  if (screen.kind === "error") {
    return <p className="text-center text-muted-foreground">Не получилось войти. Откройте Hero Fit из Telegram заново</p>;
  }
  if (screen.kind === "link") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Вход в аккаунт</CardTitle>
          <CardDescription>Войдите — и Telegram привяжется к этому аккаунту</CardDescription>
        </CardHeader>
        <CardContent>
          {/* onSubmit, не action: action сбрасывает форму, и после «Неверный пароль» пришлось бы вводить логин заново */}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void link(new FormData(e.currentTarget));
            }}
          >
            <FormField name="identifier" label="Логин или email" autoComplete="username" required />
            <FormField name="password" label="Пароль" type="password" autoComplete="current-password" required />
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Войти и привязать Telegram
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setScreen({ kind: "new", firstName: screen.firstName })}>
              Назад
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Привет, {screen.firstName}! Hero Fit — тренировки с уровнями, ачивками и боссами</CardTitle>
        <CardDescription>Аккаунт создастся по вашему Telegram — без логина и пароля.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field orientation="horizontal">
          <Checkbox id="tg-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
          <FieldContent>
            <FieldLabel htmlFor="tg-consent" className="font-normal">
              <span>
                Согласен с{" "}
                <Link href="/privacy" target="_blank" className="underline underline-offset-4 hover:text-primary">
                  политикой обработки персональных данных
                </Link>
              </span>
            </FieldLabel>
          </FieldContent>
        </Field>
        <Button size="lg" className="w-full" disabled={!consent || pending} onClick={register}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Начать
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setScreen({ kind: "link", firstName: screen.firstName })}>
          У меня уже есть аккаунт
        </Button>
      </CardContent>
    </Card>
  );
}
