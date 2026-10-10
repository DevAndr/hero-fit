import type { Metadata } from "next";
import Script from "next/script";
import { MiniAppEntry } from "@/components/telegram/mini-app-entry";

export const metadata: Metadata = { title: "Hero Fit в Telegram", robots: { index: false, follow: false } };

/** Точка входа Telegram Mini App (BotFather → Main Mini App → https://<домен>/tg). */
export default function TelegramEntryPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <MiniAppEntry />
    </>
  );
}
