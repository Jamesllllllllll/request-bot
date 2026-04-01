// Route: Returns the signed-in viewer session and accessible channel context.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { getViewerSessionData } from "~/lib/server/viewer-session-data";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return json(await getViewerSessionData(request, env as AppEnv));
      },
    },
  },
});
