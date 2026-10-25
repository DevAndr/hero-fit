import { cookies } from "next/headers";
import { Unbounded } from "next/font/google";
import { MotionProvider } from "@/components/marketing/motion";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { isEnabled } from "@/lib/flags/server";

/** Выразительный шрифт заголовков — только на публичных страницах (класс font-display). */
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], weight: ["500", "700", "800"], variable: "--font-unbounded" });

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  // Только для шапки («Открыть кабинет»): сессию окончательно проверяет кабинет
  const authed = (await cookies()).has(ACCESS_COOKIE);
  // Клубы, Android-приложение и каталог тренеров в меню — только когда открыты всем (гость видит флаг лишь при 100 %)
  const [clubs, android, trainers] = await Promise.all([isEnabled("clubs", null), isEnabled("native_app", null), isEnabled("coach_catalog", null)]);
  return (
    <div className={`${unbounded.variable} flex min-h-full flex-1 flex-col`}>
      <SiteHeader authed={authed} clubs={clubs} android={android} trainers={trainers} />
      <main className="flex-1">
        <MotionProvider>{children}</MotionProvider>
      </main>
      <SiteFooter clubs={clubs} android={android} trainers={trainers} />
    </div>
  );
}
