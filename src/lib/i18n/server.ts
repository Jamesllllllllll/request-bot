import { getLocaleCookie } from "~/lib/auth/session.server";
import type { AppEnv } from "~/lib/env";
import { resolveExplicitLocale } from "./detect";

export function resolveRequestLocale(
  request: Request,
  _env: AppEnv,
  userPreferredLocale?: string | null
) {
  return resolveExplicitLocale({
    userPreferredLocale,
    storedLocale: getLocaleCookie(request),
  });
}
