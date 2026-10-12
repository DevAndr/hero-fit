import Link from "next/link";
import type { MyClubs as MyClubsData } from "@/lib/club/queries";
import { Badge } from "@/components/ui/badge";

const STATUS: Record<MyClubsData["admin"][number]["status"], string> = {
  PENDING: "На проверке",
  APPROVED: "Одобрен",
  REJECTED: "Отклонена",
  HIDDEN: "Скрыт модератором",
};

/** Клубы, где я админ: заявки со статусами и ссылки на управление. */
export function MyClubs({ clubs }: { clubs: MyClubsData["admin"] }) {
  if (!clubs.length) return null;
  return (
    <section aria-label="Мои клубы" className="space-y-2">
      <h2 className="font-bold">Мои клубы</h2>
      <ul className="space-y-2">
        {clubs.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold break-words">{c.name}</p>
              <p className="text-sm text-muted-foreground">
                {c.city}, {c.address}
              </p>
              {c.status === "REJECTED" && c.rejectReason ? <p className="mt-1 text-sm text-destructive">Отклонена: {c.rejectReason}</p> : null}
            </div>
            {c.status === "REJECTED" ? null : <Badge variant={c.status === "APPROVED" ? "default" : "secondary"}>{STATUS[c.status]}</Badge>}
            {c.status === "APPROVED" || c.status === "HIDDEN" ? (
              <Link href={`/clubs/${c.id}/manage`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Управление
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
