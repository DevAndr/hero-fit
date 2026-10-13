import Image from "next/image";
import { avatarImage } from "@/lib/shop/avatars";
import { itemByCode } from "@/lib/shop/catalog";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-8 text-sm", md: "size-9 text-base", lg: "size-12 text-lg" } as const;
const PX = { sm: 32, md: 36, lg: 48 } as const;

/** Аватар игрока: картинка из магазина в рамке или кружок с первой буквой ника. */
export function PlayerAvatar({
  nickname,
  cosmetics,
  size = "sm",
  className,
}: {
  nickname: string;
  cosmetics?: Cosmetics;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const avatar = itemByCode(cosmetics?.avatar);
  const image = avatar?.kind === "avatar" ? avatarImage(avatar.code) : null;
  const frame = itemByCode(cosmetics?.frame);
  const ring = frame?.kind === "frame" ? frame.ring : null;
  const base = cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full", SIZES[size], ring, className);
  if (avatar && image) {
    return (
      <span className={cn(base, "bg-muted")} data-frame={frame?.code}>
        <Image src={image} alt={avatar.name} width={PX[size]} height={PX[size]} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(base, "bg-primary/15 font-bold text-primary uppercase")} data-frame={frame?.code}>
      {nickname.slice(0, 1) || "?"}
    </span>
  );
}
