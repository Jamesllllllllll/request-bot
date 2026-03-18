// Route: Returns request and moderation log data for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { getAdminDashboardState } from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/dashboard/logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        await assertDatabaseSchemaCurrent(runtimeEnv);
        const userId = await getSessionUserId(request, runtimeEnv);
        if (!userId) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const state = await getAdminDashboardState(runtimeEnv, userId);
        if (!state) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return json({
          channel: {
            id: state.channel.id,
            login: state.channel.login,
            displayName: state.channel.displayName,
          },
          logs: state.logs,
        });
      },
    },
  },
});
