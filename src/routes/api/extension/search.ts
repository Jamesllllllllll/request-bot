import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { requireExtensionAuthFromRequest } from "~/lib/server/extension-auth";
import {
  extensionCorsPreflight,
  toExtensionErrorResponse,
  withExtensionCors,
} from "~/lib/server/extension-http";
import { searchExtensionCatalog } from "~/lib/server/extension-panel";
import { json } from "~/lib/utils";
import { extensionSearchInputSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/extension/search")({
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
          const url = new URL(request.url);
          const search = extensionSearchInputSchema.parse({
            query: url.searchParams.get("query") ?? "",
            page: url.searchParams.get("page") ?? undefined,
            pageSize: url.searchParams.get("pageSize") ?? undefined,
          });

          return withExtensionCors(
            json(
              await searchExtensionCatalog({
                env: runtimeEnv,
                auth,
                search,
              })
            )
          );
        } catch (error) {
          return toExtensionErrorResponse(error, "Unable to search songs.");
        }
      },
    },
  },
});
