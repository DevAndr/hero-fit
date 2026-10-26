"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** На телефоне после ухода героя из экрана — закреплённая внизу кнопка «Начать бесплатно». */
export function StickyCta() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-foreground/10 bg-background/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-300 motion-reduce:transition-none md:hidden",
        shown ? "translate-y-0" : "translate-y-full",
      )}
    >
      <Link href="/register" className={buttonVariants({ size: "lg", className: "h-12 w-full text-base" })}>
        Начать бесплатно <ArrowRight aria-hidden />
      </Link>
    </div>
  );
}
