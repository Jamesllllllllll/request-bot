import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { requireExtensionAuthFromRequest } from "~/lib/server/extension-auth";
import {
  extensionCorsPreflight,
  toExtensionErrorResponse,
  withExtensionCors,
} from "~/lib/server/extension-http";
import { getExtensionBootstrapState } from "~/lib/server/extension-panel";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/extension/bootstrap")({
  server: {
    handlers: {
      OPTIONS: async () => extensionCorsPreflight(),
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;

        try {
          const auth = await requireExtensionAuthFromRequest({
            env: runtimeEnv,
            request,
          });

          return withExtensionCors(
            json(
              await getExtensionBootstrapState({
                env: runtimeEnv,
                auth,
              })
            )
          );
        } catch (error) {
          return toExtensionErrorResponse(error);
        }
      },
    },
  },
});
