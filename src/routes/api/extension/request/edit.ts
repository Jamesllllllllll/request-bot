import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import {
  type ExtensionAuthContext,
  requireExtensionAuthFromRequest,
} from "~/lib/server/extension-auth";
import {
  extensionCorsPreflight,
  toExtensionErrorResponse,
  withExtensionCors,
} from "~/lib/server/extension-http";
import { performExtensionViewerRequestMutation } from "~/lib/server/extension-panel";
import type { ViewerRequestMutationInput } from "~/lib/server/viewer-request";
import { json } from "~/lib/utils";
import { extensionSubmitRequestSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/extension/request/edit")({
  server: {
    handlers: {
      OPTIONS: async () => extensionCorsPreflight(),
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;

        try {
          const auth: ExtensionAuthContext =
            await requireExtensionAuthFromRequest({
              env: runtimeEnv,
              request,
            });
          const body = extensionSubmitRequestSchema.parse(await request.json());
          const mutation: ViewerRequestMutationInput =
            "songId" in body
              ? {
                  action: "submit",
                  songId: body.songId,
                  requestMode: body.requestMode ?? "catalog",
                  requestKind: body.requestKind,
                  vipTokenCost: body.vipTokenCost,
                  replaceExisting: true,
                  itemId: body.itemId,
                }
              : {
                  action: "submit",
                  query: body.query,
                  requestMode: body.requestMode,
                  requestKind: body.requestKind,
                  vipTokenCost: body.vipTokenCost,
                  replaceExisting: true,
                  itemId: body.itemId,
                };

          return withExtensionCors(
            json(
              await performExtensionViewerRequestMutation({
                env: runtimeEnv,
                auth,
                mutation,
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
