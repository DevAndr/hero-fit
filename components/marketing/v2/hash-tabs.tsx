"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";

/**
 * Вкладки, которые открываются по якорю: /#guilds — вкладка guilds. Ссылки шапки «Гильдии» и «Клубы» ведут
 * в одну секцию, и посетитель должен увидеть то, что выбрал.
 */
export function HashTabs({ defaultValue, values, children }: { defaultValue: string; values: string[]; children: ReactNode }) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (values.includes(hash)) setValue(hash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [values]);
  return (
    <Tabs value={value} onValueChange={(v) => setValue(String(v))}>
      {children}
    </Tabs>
  );
}
