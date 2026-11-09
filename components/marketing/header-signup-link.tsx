"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { COACH_SIGNUP_HREF } from "@/lib/coach/signup";

/** Кнопка регистрации в шапке: на странице для тренеров ведёт в регистрацию тренера, иначе он заведёт обычный аккаунт. */
export function HeaderSignupLink() {
  const forCoaches = usePathname() === "/for-coaches";
  return (
    <Link href={forCoaches ? COACH_SIGNUP_HREF : "/register"} className={buttonVariants()}>
      {forCoaches ? "Стать тренером" : "Начать бесплатно"}
    </Link>
  );
}
