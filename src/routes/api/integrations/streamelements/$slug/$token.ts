// Route: Accepts StreamElements tip relays and converts them into VIP tokens.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  ensureStreamElementsTipWebhookToken,
  getChannelBySlug,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  createStreamElementsTipDependencies,
  parseStreamElementsTipPayload,
  processStreamElementsTip,
} from "~/lib/streamelements/tips";
import { json } from "~/lib/utils";

const streamElementsCorsHeaderEntries = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function withStreamElementsCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(streamElementsCorsHeaderEntries)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute(
  "/api/integrations/streamelements/$slug/$token"
)({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: streamElementsCorsHeaderEntries,
        }),
      POST: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const channel = await getChannelBySlug(runtimeEnv, params.slug);

        if (!channel) {
          return withStreamElementsCors(
            json({ message: "Channel not found." }, { status: 404 })
          );
        }

        const expectedToken = await ensureStreamElementsTipWebhookToken(
          runtimeEnv,
          channel.id
        );
        if (expectedToken !== params.token) {
          return withStreamElementsCors(
            json({ message: "Invalid relay token." }, { status: 401 })
          );
        }

        const payload = await request.json().catch(() => null);
        const tip = parseStreamElementsTipPayload(payload);

        if (!tip) {
          return withStreamElementsCors(
            json(
              { message: "Invalid StreamElements tip payload." },
              { status: 400 }
            )
          );
        }

        console.info("StreamElements tip relay received", {
          channelSlug: channel.slug,
          rawLogin: tip.rawLogin,
          amount: tip.amount,
          currency: tip.currency,
          deliveryId: tip.deliveryId,
        });

        const result = await processStreamElementsTip({
          env: runtimeEnv,
          deps: createStreamElementsTipDependencies(),
          channel: {
            id: channel.id,
            ownerUserId: channel.ownerUserId,
            twitchChannelId: channel.twitchChannelId,
            slug: channel.slug,
          },
          tip,
        });

        return withStreamElementsCors(
          json(
            {
              message:
                result.body === "Accepted"
                  ? "VIP tokens granted."
                  : result.body === "Duplicate"
                    ? "Duplicate tip ignored."
                    : "Tip ignored.",
            },
            { status: result.status }
          )
        );
      },
    },
  },
});
