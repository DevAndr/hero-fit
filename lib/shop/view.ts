import type { ItemKind, Rarity } from "@/lib/shop/catalog";

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

export const KIND_TABS: { kind: ItemKind; label: string }[] = [
  { kind: "avatar", label: "Аватары" },
  { kind: "frame", label: "Рамки" },
  { kind: "nickColor", label: "Цвет ника" },
  { kind: "theme", label: "Темы" },
];
