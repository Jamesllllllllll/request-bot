// Route: Returns viewer request state and handles public viewer request writes.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import {
  getViewerRequestState,
  performViewerRequestMutation,
  ViewerRequestError,
} from "~/lib/server/viewer-request";
import { json } from "~/lib/utils";
import { viewerRequestMutationSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/channel/$slug/viewer-request")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;

        try {
          return json(
            await getViewerRequestState({
              env: runtimeEnv,
              request,
              slug: params.slug,
            })
          );
        } catch (error) {
          return toViewerRequestErrorResponse(error);
        }
      },
      POST: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;

        try {
          const mutation = viewerRequestMutationSchema.parse(
            await request.json()
          );

          return json(
            await performViewerRequestMutation({
              env: runtimeEnv,
              request,
              slug: params.slug,
              mutation,
            })
          );
        } catch (error) {
          return toViewerRequestErrorResponse(error);
        }
      },
    },
  },
});

function toViewerRequestErrorResponse(error: unknown) {
  if (error instanceof ViewerRequestError) {
    return json({ error: error.message }, { status: error.status });
  }

  return json(
    {
      error:
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unable to update viewer requests.",
    },
    { status: 500 }
  );
}
