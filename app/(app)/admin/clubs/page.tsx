import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { ReviewCard } from "@/components/club/review-card";
import { SegmentNav } from "@/components/club/segment-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth/admin";
import { getClubsForReview } from "@/lib/club/queries";

export const metadata: Metadata = { title: "Клубы" };

/** Модерация клубов (только ADMIN_LOGINS, остальным — 404): заявки, скрытие и правка одобренных. */
export default async function ClubsModerationPage({ searchParams }: PageProps<"/admin/clubs">) {
  await requireAdmin();
  const params = await searchParams;
  const tab = params.tab === "approved" ? "approved" : "pending";
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const clubs = await getClubsForReview(tab, q);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Клубы" description="Заявки на клубы залов: одобрить, отклонить с причиной, скрыть." />
      <SegmentNav
        label="Разделы"
        current={tab}
        items={[
          { key: "pending", label: "На проверке", href: "/admin/clubs" },
          { key: "approved", label: "Одобренные", href: "/admin/clubs?tab=approved" },
        ]}
      />
      {tab === "approved" ? (
        <form className="flex gap-2">
          <input type="hidden" name="tab" value="approved" />
          <Input name="q" defaultValue={q} aria-label="Поиск клуба" placeholder="Название, город или адрес" className="max-w-72" />
          <Button type="submit" variant="outline">
            Найти
          </Button>
        </form>
      ) : null}
      {clubs.length ? (
        clubs.map((c) => <ReviewCard key={c.id} club={c} />)
      ) : (
        <p className="text-sm text-muted-foreground">{tab === "pending" ? "Заявок нет." : "Ничего не найдено."}</p>
      )}
    </div>
  );
}
