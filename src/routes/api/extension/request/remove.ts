import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { requireExtensionAuthFromRequest } from "~/lib/server/extension-auth";
import {
  extensionCorsPreflight,
  toExtensionErrorResponse,
  withExtensionCors,
} from "~/lib/server/extension-http";
import { performExtensionViewerRequestMutation } from "~/lib/server/extension-panel";
import { json } from "~/lib/utils";
import { extensionRemoveRequestSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/extension/request/remove")({
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
          const body = extensionRemoveRequestSchema.parse(await request.json());

          return withExtensionCors(
            json(
              await performExtensionViewerRequestMutation({
                env: runtimeEnv,
                auth,
                mutation: {
                  action: "remove",
                  kind: body.kind,
                  itemId: body.itemId,
                },
              })
            )
          );
        } catch (error) {
          return toExtensionErrorResponse(error, "Unable to remove requests.");
        }
      },
    },
  },
});
