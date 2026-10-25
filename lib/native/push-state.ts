/** Почему push в Android-приложении сейчас не работают (подсказка в /settings); null — всё в порядке. */
export type NativePushReason = "no-distributor" | "foreign-server" | "permission" | "server-off" | null;

export function nativePushReason(input: {
  distributor: boolean;
  permission: "granted" | "denied" | "prompt";
  endpoint: string | null;
  ntfyHost: string | null;
}): NativePushReason {
  if (input.ntfyHost === null) return "server-off";
  if (!input.distributor) return "no-distributor";
  if (input.permission === "denied") return "permission";
  if (input.endpoint) {
    let host: string | null = null;
    try {
      host = new URL(input.endpoint).hostname.toLowerCase();
    } catch {}
    if (host !== input.ntfyHost) return "foreign-server";
  }
  return null;
}
