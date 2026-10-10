"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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

/** 152-ФЗ: согласие на обработку персональных данных — отдельной галочкой (key — восстановить её после ошибки). */
function ConsentField({ checked, errors }: { checked: boolean; errors?: string[] }) {
  const invalid = Boolean(errors?.length);
  return (
    <Field orientation="horizontal" data-invalid={invalid || undefined}>
      <Checkbox id="field-consent" name="consent" defaultChecked={checked} aria-invalid={invalid || undefined} />
      <FieldContent>
        <FieldLabel htmlFor="field-consent" className="font-normal">
          <span>
            Даю согласие на обработку персональных данных по{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-4 hover:text-primary">
              политике конфиденциальности
            </Link>
          </span>
        </FieldLabel>
        <FieldError errors={errors?.map((message) => ({ message }))} />
      </FieldContent>
    </Field>
  );
}

/** «Я тренер»: сразу режим тренера; клиенты видят тренера по нику, поэтому с галочкой ник обязателен. */
function CoachField({ checked, nickname, errors }: { checked: boolean; nickname?: string; errors?: string[] }) {
  const [coach, setCoach] = useState(checked);
  return (
    <>
      <Field orientation="horizontal">
        {/* Значение — скрытым полем: сброс формы после ошибки снимает «галочку» у input чекбокса, а состояние остаётся */}
        {coach ? <input type="hidden" name="coach" value="on" /> : null}
        <Checkbox id="field-coach" checked={coach} onCheckedChange={(v) => setCoach(v === true)} />
        <FieldContent>
          <FieldLabel htmlFor="field-coach" className="font-normal">
            Я тренер, буду вести клиентов
          </FieldLabel>
        </FieldContent>
      </Field>
      {coach ? (
        <FormField
          name="nickname"
          label="Публичный ник"
          autoComplete="off"
          defaultValue={nickname}
          errors={errors}
          description="Клиенты видят тренера по нику: 3–20 символов, буквы, цифры, «_», «-», «.»"
        />
      ) : null}
    </>
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
        {/* Без key: галочка — своё состояние и переживает ошибку отправки */}
        <CoachField
          checked={state.values?.coach === "on"}
          nickname={state.values?.nickname}
          errors={state.errors?.nickname}
        />
        <ConsentField key={state.values?.consent ?? "off"} checked={state.values?.consent === "on"} errors={state.errors?.consent} />
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
