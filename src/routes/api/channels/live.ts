// Route: Returns the current list of live channels known to the app.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getLiveChannels } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channels/live")({
  server: {
    handlers: {
      GET: async () => {
        const channels = await getLiveChannels(env as AppEnv);
        return json({ channels });
      },
    },
  },
});
