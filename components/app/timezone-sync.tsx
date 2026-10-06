"use client";

import { useEffect } from "react";

/** Сообщает серверу часовой пояс браузера (для «ежедневного входа» по календарным дням). */
export function TimezoneSync({ cookieName, current }: { cookieName: string; current?: string }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) {
      document.cookie = `${cookieName}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [cookieName, current]);
  return null;
}
