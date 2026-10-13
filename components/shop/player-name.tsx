import type { CSSProperties } from "react";
import { itemByCode } from "@/lib/shop/catalog";
import { cn } from "@/lib/utils";

/** Ник игрока; надетый цвет (из магазина) — через переменные и классы темы, код — в data-nick-color. */
export function PlayerName({
  nickname,
  color,
  className,
}: {
  nickname: string;
  color?: string | null;
  className?: string;
}) {
  const item = itemByCode(color);
  if (item?.kind !== "nickColor") return <span className={className}>{nickname}</span>;
  const style = {
    "--nick-light": item.light,
    "--nick-dark": item.dark,
    ...(item.gradient
      ? {
          "--nick-g1-light": item.gradient.light[0],
          "--nick-g2-light": item.gradient.light[1],
          "--nick-g1-dark": item.gradient.dark[0],
          "--nick-g2-dark": item.gradient.dark[1],
        }
      : {}),
  } as CSSProperties;
  return (
    <span data-nick-color={item.code} style={style} className={cn("nick-color", item.gradient && "nick-gradient", className)}>
      {nickname}
    </span>
  );
}
