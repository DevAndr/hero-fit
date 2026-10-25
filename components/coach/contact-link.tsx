"use client";

import { AtSign, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { contactClickAction } from "@/lib/coach/catalog-actions";
import type { ContactKind } from "@/lib/coach/contacts";

const ICONS = { telegram: Send, whatsapp: MessageCircle, vk: AtSign, phone: Phone, email: Mail } as const;

/** Кнопка-ссылка контакта; открытие считается для тренера без ожидания ответа — переход не задерживается. */
export function ContactLink({ coachId, kind, label, text, href }: { coachId: string; kind: ContactKind; label: string; text: string; href: string }) {
  const Icon = ICONS[kind];
  const external = href.startsWith("https://");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      className={buttonVariants({ variant: "outline", size: "sm" })}
      onClick={() => void contactClickAction(coachId).catch(() => undefined)}
    >
      <Icon aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span>{text}</span>
    </a>
  );
}
