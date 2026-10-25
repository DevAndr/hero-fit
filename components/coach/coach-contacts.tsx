import Link from "next/link";
import { LogIn } from "lucide-react";
import { ContactLink } from "@/components/coach/contact-link";
import { buttonVariants } from "@/components/ui/button";
import { contactLinks, type Contacts } from "@/lib/coach/contacts";

/**
 * Контакты тренера (каталог и /trainer/<ник>). Гостю — только приглашение войти: контакты в разметку не попадают.
 * Видимость (согласие, флаг) проверяет вызывающий.
 */
export function CoachContacts({ coachId, contacts, signedIn, nextPath }: { coachId: string; contacts: Contacts; signedIn: boolean; nextPath: string }) {
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <LogIn />
        Войдите, чтобы увидеть контакты
      </Link>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {contactLinks(contacts).map((c) => (
        <li key={c.kind}>
          <ContactLink coachId={coachId} {...c} />
        </li>
      ))}
    </ul>
  );
}
