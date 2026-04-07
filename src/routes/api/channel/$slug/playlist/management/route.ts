import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import {
  getPlaylistManagementPageData,
  requirePlaylistManagementState,
  toPlaylistMutationErrorResponse,
} from "~/lib/server/playlist-management";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channel/$slug/playlist/management")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requirePlaylistManagementState(
          request,
          runtimeEnv,
          params.slug
        );

        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          return json(await getPlaylistManagementPageData(runtimeEnv, state));
        } catch (error) {
          return toPlaylistMutationErrorResponse(error);
        }
      },
    },
  },
});
