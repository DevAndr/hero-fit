"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { FormMessage } from "@/components/auth/auth-forms";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { setSiteLoginAction, type FormState } from "@/lib/auth/actions";

/** Аккаунт из Telegram Mini App: email и пароль, чтобы входить и на сайте. */
export function SiteLoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setSiteLoginAction, {});
  return (
    <section id="site-login" aria-label="Вход на сайте" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound className="size-4 text-primary" />
        Вход на сайте
      </h2>
      <p className="text-sm text-muted-foreground">Аккаунт создан в Telegram. Задайте email и пароль, чтобы входить и на сайте.</p>
      <form action={action} className="space-y-3">
        <FormField name="email" label="Email" type="email" autoComplete="email" defaultValue={state.values?.email} errors={state.errors?.email} />
        <FormField name="password" label="Пароль" type="password" autoComplete="new-password" errors={state.errors?.password} />
        <FormField name="confirmPassword" label="Повторите пароль" type="password" autoComplete="new-password" errors={state.errors?.confirmPassword} />
        <FormMessage state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </form>
    </section>
  );
}
