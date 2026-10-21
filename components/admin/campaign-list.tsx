import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CampaignStatus } from "@/generated/prisma/enums";
import type { CampaignRow } from "@/lib/campaigns/queries";
import { conditionLabel } from "@/lib/campaigns/rules";

const STATUS: Record<CampaignStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  DRAFT: { label: "Черновик", variant: "outline" },
  ACTIVE: { label: "Идёт", variant: "default" },
  PAUSED: { label: "На паузе", variant: "secondary" },
  ARCHIVED: { label: "Архив", variant: "outline" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  if (campaigns.length === 0) return <p className="text-sm text-muted-foreground">Рассылок пока нет</p>;
  return (
    <ul className="space-y-3">
      {campaigns.map((c) => {
        const percent = c.sent30 > 0 ? Math.round((c.returned30 / c.sent30) * 100) : 0;
        return (
          <li key={c.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/campaigns/${c.id}`} className="min-w-0 truncate font-medium hover:underline">
                {c.name}
              </Link>
              <CampaignStatusBadge status={c.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {conditionLabel(c.condition, c.days)} · в {c.hour}:00
            </p>
            <p className="mt-2 text-sm tabular-nums">
              <span>Отправлено {c.sent30}</span>
              {c.sent30 > 0 ? (
                <span>
                  {" "}
                  · Вернулись {c.returned30} · {percent} %
                </span>
              ) : null}
              <span className="text-muted-foreground"> за 30 дней</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
