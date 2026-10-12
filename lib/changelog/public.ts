import "server-only";
import { flagOn } from "@/lib/flags/eval";
import { getFlagStates } from "@/lib/flags/server";
import { RELEASES } from "./releases";
import type { Release } from "./types";
import { visibleRelease } from "./view";

/** Релизы для гостя: пункты под флагом — только при раскатке на 100 %, ссылки — только на публичные страницы. */
export async function publicReleases(): Promise<Release[]> {
  const states = await getFlagStates();
  return RELEASES.map((r) => visibleRelease(r, { enabled: (f) => flagOn(f, states.get(f) ?? null, null), publicOnly: true })).filter(
    (r): r is Release => r !== null,
  );
}
