"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { HeroPush, isNativeApp } from "@/lib/native/hero-push";

/** Android-приложение: системная «Назад» ходит по истории сайта, на первой странице — закрывает приложение. */
export function NativeBackButton() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const listener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
    return () => void listener.then((l) => l.remove());
  }, []);
  return null;
}

/** « · Android 1.0.0 (play)» к строке версии в /settings; в браузере — ничего. */
export function NativeVersion() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    HeroPush.appVersion()
      .then((v) => setLabel(` · Android ${v.version} (${v.flavor})`))
      .catch(() => {});
  }, []);
  return label;
}
