import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  getDashboardState,
  searchCatalogArtistsForBlacklist,
  searchCatalogChartersForBlacklist,
  searchCatalogSongsForBlacklist,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

async function requireDashboardAccess(request: Request, runtimeEnv: AppEnv) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getDashboardState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/moderation/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardAccess(request, runtimeEnv);
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const query = url.searchParams.get("query")?.trim() ?? "";
        const type = url.searchParams.get("type");

        if (query.length < 2) {
          return json({
            artists: [],
            charters: [],
            songs: [],
          });
        }

        if (type === "artist") {
          return json({
            artists: await searchCatalogArtistsForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        if (type === "charter") {
          return json({
            charters: await searchCatalogChartersForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        if (type === "song") {
          return json({
            songs: await searchCatalogSongsForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        const [artists, charters, songs] = await Promise.all([
          searchCatalogArtistsForBlacklist(runtimeEnv, { query }),
          searchCatalogChartersForBlacklist(runtimeEnv, { query }),
          searchCatalogSongsForBlacklist(runtimeEnv, { query }),
        ]);

        return json({ artists, charters, songs });
      },
    },
  },
});
