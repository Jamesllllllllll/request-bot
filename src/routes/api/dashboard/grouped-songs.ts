import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  getAdminDashboardBaseState,
  getCatalogGroupedSongsReportPage,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";
import { groupedSongsPageSchema } from "~/lib/validation";

async function requireAdminDashboardBaseState(
  request: Request,
  runtimeEnv: AppEnv
) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getAdminDashboardBaseState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/grouped-songs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!import.meta.env.DEV) {
          return json({ error: "Not found" }, { status: 404 });
        }

        const runtimeEnv = env as AppEnv;
        const state = await requireAdminDashboardBaseState(request, runtimeEnv);

        if (!state) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(request.url);
        const parsed = groupedSongsPageSchema.safeParse({
          page: url.searchParams.get("page") ?? undefined,
          pageSize: url.searchParams.get("pageSize") ?? undefined,
          query: url.searchParams.get("query") ?? undefined,
          groupingSource: url.searchParams.get("groupingSource") ?? undefined,
        });

        if (!parsed.success) {
          return json(
            {
              error:
                parsed.error.issues[0]?.message ??
                "Invalid grouped songs page.",
            },
            { status: 400 }
          );
        }

        return json(
          await getCatalogGroupedSongsReportPage(runtimeEnv, {
            channelId: state.channel.id,
            page: parsed.data.page,
            pageSize: parsed.data.pageSize,
            query: parsed.data.query,
            groupingSource: parsed.data.groupingSource,
          })
        );
      },
    },
  },
});
