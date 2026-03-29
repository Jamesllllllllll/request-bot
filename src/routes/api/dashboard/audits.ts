// Route: Returns paginated audit log data for the active admin dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  getAdminDashboardBaseState,
  getAuditLogsPageForChannel,
} from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

function parsePaginationParam(
  searchParams: URLSearchParams,
  key: string,
  fallback: number,
  max: number
) {
  const rawValue = Number(searchParams.get(key) ?? fallback);
  if (!Number.isFinite(rawValue)) {
    return fallback;
  }

  const normalizedValue = Math.trunc(rawValue);
  if (normalizedValue < 0) {
    return key === "offset" ? 0 : fallback;
  }

  return key === "offset"
    ? normalizedValue
    : Math.max(1, Math.min(max, normalizedValue));
}

export const Route = createFileRoute("/api/dashboard/audits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        await assertDatabaseSchemaCurrent(runtimeEnv);
        const userId = await getSessionUserId(request, runtimeEnv);
        if (!userId) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const state = await getAdminDashboardBaseState(runtimeEnv, userId);
        if (!state) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(request.url);
        const offset = parsePaginationParam(
          url.searchParams,
          "offset",
          0,
          1000
        );
        const limit = parsePaginationParam(url.searchParams, "limit", 10, 100);
        const auditsPage = await getAuditLogsPageForChannel(runtimeEnv, {
          channelId: state.channel.id,
          offset,
          limit,
        });

        return json({
          channel: {
            id: state.channel.id,
            login: state.channel.login,
            displayName: state.channel.displayName,
          },
          audits: auditsPage.rows,
          total: auditsPage.total,
          offset: auditsPage.offset,
          limit: auditsPage.limit,
          hasPrevious: auditsPage.hasPrevious,
          hasNext: auditsPage.hasNext,
        });
      },
    },
  },
});
