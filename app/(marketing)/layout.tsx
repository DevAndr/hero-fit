import { cookies } from "next/headers";
import { Unbounded } from "next/font/google";
import { MotionProvider } from "@/components/marketing/motion";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

/** Выразительный шрифт заголовков — только на публичных страницах (класс font-display). */
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], weight: ["500", "700", "800"], variable: "--font-unbounded" });

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  // Только для шапки («Открыть кабинет»): сессию окончательно проверяет кабинет
  const authed = (await cookies()).has(ACCESS_COOKIE);
  return (
    <div className={`${unbounded.variable} flex min-h-full flex-1 flex-col`}>
      <SiteHeader authed={authed} />
      <main className="flex-1">
        <MotionProvider>{children}</MotionProvider>
      </main>
      <SiteFooter />
    </div>
  );
}
