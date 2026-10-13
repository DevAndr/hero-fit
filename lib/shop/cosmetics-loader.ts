import "server-only";
import { getFlagStates } from "@/lib/flags/server";
import { visibleCosmetics, type Cosmetics, type CosmeticsRow } from "@/lib/shop/cosmetics";

/** Один getFlagStates() на запрос; дальше — синхронно по строкам. */
export async function cosmeticsLoader(): Promise<(row: CosmeticsRow) => Cosmetics> {
  const shop = (await getFlagStates()).get("shop") ?? null;
  return (row) => visibleCosmetics(row, shop);
}
