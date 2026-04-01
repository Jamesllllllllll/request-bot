import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { buildLocaleCookie, getSessionUserId } from "~/lib/auth/session.server";
import { updateUserPreferredLocale } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { normalizeLocale } from "~/lib/i18n/locales";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/session/locale")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const payload = (await request.json().catch(() => null)) as {
          locale?: string;
        } | null;
        const locale = normalizeLocale(payload?.locale);

        if (!locale) {
          return json(
            { error: "invalid_locale", message: "Locale is invalid." },
            { status: 400 }
          );
        }

        const userId = await getSessionUserId(request, runtimeEnv);
        if (userId) {
          await updateUserPreferredLocale(runtimeEnv, userId, locale);
        }

        return json(
          { ok: true, locale },
          {
            headers: {
              "set-cookie": buildLocaleCookie(locale, runtimeEnv),
            },
          }
        );
      },
    },
  },
});
