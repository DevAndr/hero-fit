import "server-only";
import { env } from "@/lib/env";

export { WHOOP_SCOPES, WHOOP_LEGACY_SCOPES, hasScope } from "./scopes";

export function whoopConfigured(): boolean {
  return !!(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET && env.WHOOP_TOKEN_KEY);
}

export function oauthUrl(path: "auth" | "token"): string {
  return `${env.WHOOP_API_URL}/oauth/oauth2/${path}`;
}

/** path начинается с `/v2/...` */
export function apiUrl(path: string): string {
  return `${env.WHOOP_API_URL}/developer${path}`;
}

export function redirectUri(): string {
  return `${env.APP_URL}/api/whoop/callback`;
}
