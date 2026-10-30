import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SITE_LOGIN_HINT } from "@/lib/telegram/site-login-hint";
import { hideSiteLoginHintAction } from "@/lib/telegram/site-login-hint-actions";

/** Дашборд: аккаунт из Telegram без пароля — задать email и пароль, чтобы входить и на сайте. «Скрыть» — форма: работает и до гидрации. */
export function SiteLoginHintCard() {
  return (
    <section aria-label="Входите и на сайте" className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-primary" aria-hidden />
        Входите и на сайте
      </h2>
      <p className="text-sm text-muted-foreground">{SITE_LOGIN_HINT.body}</p>
      <form action={hideSiteLoginHintAction} className="flex flex-wrap gap-2">
        <Link href={SITE_LOGIN_HINT.url} className={buttonVariants({ size: "sm" })}>
          Задать пароль
        </Link>
        <Button type="submit" size="sm" variant="ghost">
          Скрыть
        </Button>
      </form>
    </section>
  );
}
