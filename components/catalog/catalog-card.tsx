import Link from "next/link";
import { plural } from "@/lib/format";
import type { CatalogItem } from "@/lib/catalog/queries";

export function AuthorLink({ author }: { author: CatalogItem["author"] }) {
  return author.publicPage ? (
    <Link href={`/trainer/${encodeURIComponent(author.nickname)}`} className="font-medium text-foreground hover:underline">
      {author.nickname}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{author.nickname}</span>
  );
}

export function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <li aria-label={item.name} className="space-y-1 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">
        <Link href={`/programs/${item.id}`} className="hover:underline">
          {item.name}
        </Link>
      </h2>
      <p className="text-sm text-muted-foreground">
        {item.weeks} нед. · {item.perWeek} {plural(item.perWeek, "день", "дня", "дней")} в неделю · занимаются {item.participants}
      </p>
      <p className="text-sm text-muted-foreground">{item.ruleText}</p>
      <p className="text-xs text-muted-foreground">
        Автор: <AuthorLink author={item.author} />
      </p>
    </li>
  );
}
