"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { FormField } from "@/components/auth/form-field";
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  type FormState,
} from "@/lib/auth/actions";

const initial: FormState = {};

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function FormMessage({ state }: { state: Pick<FormState, "message" | "success"> }) {
  if (!state.message) return null;
  const Icon = state.success ? CircleCheck : CircleAlert;
  return (
    <div
      role={state.success ? "status" : "alert"}
      className={
        state.success
          ? "flex gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm"
          : "flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{state.message}</span>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FieldGroup>
        <FormMessage state={state} />
        <FormField
          name="identifier"
          label="Логин или email"
          autoComplete="username"
          defaultValue={state.values?.identifier}
          errors={state.errors?.identifier}
          autoFocus
        />
        <div className="space-y-2">
          <FormField
            name="password"
            label="Пароль"
            type="password"
            autoComplete="current-password"
            errors={state.errors?.password}
          />
          <Link href="/forgot-password" className="block text-right text-sm text-muted-foreground hover:text-primary">
            Забыли пароль?
          </Link>
        </div>
        <SubmitButton pending={pending}>Войти</SubmitButton>
      </FieldGroup>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);

  return (
    <form action={action} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <FormField
          name="login"
          label="Логин"
          autoComplete="username"
          defaultValue={state.values?.login}
          errors={state.errors?.login}
          description="Латинские буквы, цифры, «_», «.», «-»"
          autoFocus
        />
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          errors={state.errors?.email}
        />
        <FormField
          name="name"
          label="Имя (необязательно)"
          autoComplete="nickname"
          defaultValue={state.values?.name}
          errors={state.errors?.name}
        />
        <FormField
          name="password"
          label="Пароль"
          type="password"
          autoComplete="new-password"
          errors={state.errors?.password}
          description="Минимум 8 символов, строчная и заглавная буквы, цифра"
        />
        <FormField
          name="confirmPassword"
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          errors={state.errors?.confirmPassword}
        />
        <SubmitButton pending={pending}>Создать аккаунт</SubmitButton>
      </FieldGroup>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);

  if (state.success) return <FormMessage state={state} />;

  return (
    <form action={action} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          errors={state.errors?.email}
          autoFocus
        />
        <SubmitButton pending={pending}>Отправить ссылку</SubmitButton>
      </FieldGroup>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="token" value={token} />
      <FieldGroup>
        <FormMessage state={{ message: state.message ?? state.errors?.token?.[0] }} />
        <FormField
          name="password"
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          errors={state.errors?.password}
          description="Минимум 8 символов, строчная и заглавная буквы, цифра"
          autoFocus
        />
        <FormField
          name="confirmPassword"
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          errors={state.errors?.confirmPassword}
        />
        <SubmitButton pending={pending}>Сохранить пароль</SubmitButton>
      </FieldGroup>
    </form>
  );
}
