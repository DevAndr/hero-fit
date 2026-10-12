import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ClubSearch } from "@/components/club/club-search";
import { MyClubs } from "@/components/club/my-clubs";
import { buttonVariants } from "@/components/ui/button";
import { requireClubs } from "@/lib/club/access";
import { getMyClubs, searchClubs } from "@/lib/club/queries";

export const metadata: Metadata = { title: "Клубы" };

const param = (v: string | string[] | undefined, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Клубы залов: свой клуб — сразу его страница; иначе поиск, заявка и мои клубы. */
export default async function ClubsPage({ searchParams }: PageProps<"/clubs">) {
  const user = await requireClubs();
  const params = await searchParams;
  const mine = await getMyClubs(user.id);
  // ?list=1 — поиск и «Мои клубы» и для того, кто уже в клубе
  if (mine.member && !params.list) redirect(`/clubs/${mine.member.id}`);
  const city = param(params.city, 40);
  const q = param(params.q, 60);
  const searched = Boolean(city.trim() || q.trim());
  const results = searched ? await searchClubs(city, q) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Клубы"
        description="Клуб — сообщество твоего зала: общий рейтинг и лента достижений."
        actions={
          <Link href="/clubs/new" className={buttonVariants({ variant: "outline" })}>
            <Plus />
            Создать клуб
          </Link>
        }
      />
      {mine.member ? (
        <p className="text-sm">
          Ты в клубе{" "}
          <Link href={`/clubs/${mine.member.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            «{mine.member.name}»
          </Link>
        </p>
      ) : null}
      <ClubSearch city={city} q={q} />
      {searched ? (
        results.length ? (
          <ul aria-label="Клубы" className="space-y-2">
            {results.map((c) => (
              <li key={c.id}>
                <Link href={`/clubs/${c.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.city}, {c.address}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    <Users className="size-4" aria-hidden />
                    {c.members}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ничего не нашлось. Нет твоего зала — создай клуб, и после проверки он появится в поиске.</p>
        )
      ) : null}
      <MyClubs clubs={mine.admin} />
    </div>
  );
}
