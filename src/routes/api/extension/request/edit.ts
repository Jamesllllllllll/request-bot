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
import { extensionSubmitRequestSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/extension/request/edit")({
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
          const body = extensionSubmitRequestSchema.parse(await request.json());

          return withExtensionCors(
            json(
              await performExtensionViewerRequestMutation({
                env: runtimeEnv,
                auth,
                mutation: {
                  action: "submit",
                  songId: body.songId,
                  requestKind: body.requestKind,
                  replaceExisting: true,
                  itemId: body.itemId,
                },
              })
            )
          );
        } catch (error) {
          return toExtensionErrorResponse(error, "Unable to edit request.");
        }
      },
    },
  },
});
