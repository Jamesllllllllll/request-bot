import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { requireExtensionAuthFromRequest } from "~/lib/server/extension-auth";
import {
  extensionCorsPreflight,
  toExtensionErrorResponse,
  withExtensionCors,
} from "~/lib/server/extension-http";
import { performExtensionPlaylistMutation } from "~/lib/server/extension-panel";
import { extensionPlaylistMutationSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/extension/playlist")({
  server: {
    handlers: {
      OPTIONS: async () => extensionCorsPreflight(),
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;

        try {
          const auth = await requireExtensionAuthFromRequest({
            env: runtimeEnv,
            request,
          });
          const body = extensionPlaylistMutationSchema.parse(
            await request.json()
          );

          return withExtensionCors(
            await performExtensionPlaylistMutation({
              env: runtimeEnv,
              auth,
              mutation: body,
            })
          );
        } catch (error) {
          return toExtensionErrorResponse(
            error,
            "Unable to update the playlist from the panel."
          );
        }
      },
    },
  },
});
