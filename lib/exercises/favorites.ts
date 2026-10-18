/** Избранные — первыми, внутри обеих частей — по названию. */
export function sortFavoritesFirst<T extends { favorite: boolean; name: string }>(items: T[]): T[] {
  return items.toSorted((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "ru"));
}
