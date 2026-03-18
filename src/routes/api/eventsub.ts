// Route: Receives Twitch EventSub webhooks and dispatches channel events.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getChannelSettingsByChannelId } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  createEventSubChatDependencies,
  processEventSubChatMessage,
} from "~/lib/eventsub/chat-message";
import { normalizeCommandPrefix } from "~/lib/request-policy";
import { normalizeChatEvent, parseChatCommand } from "~/lib/requests";
import {
  isChatMessageEvent,
  isStreamOfflineEvent,
  isStreamOnlineEvent,
} from "~/lib/twitch/api";
import {
  markChannelLiveAndReconcile,
  markChannelOfflineAndReconcile,
} from "~/lib/twitch/bot";
import { verifyEventSubSignature } from "~/lib/twitch/eventsub";

const chatDeps = createEventSubChatDependencies();

export const Route = createFileRoute("/api/eventsub")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const bodyText = await request.text();
        const messageType = request.headers.get("Twitch-Eventsub-Message-Type");

        console.info("EventSub webhook received", {
          messageType,
          contentLength: bodyText.length,
        });

        if (!(await verifyEventSubSignature(request, runtimeEnv, bodyText))) {
          console.error("EventSub signature verification failed");
          return new Response("Invalid signature", { status: 401 });
        }

        const payload = JSON.parse(bodyText) as Record<string, unknown>;

        if (messageType === "webhook_callback_verification") {
          console.info("EventSub webhook verification challenge received");
          return new Response(String(payload.challenge ?? ""), {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        if (isStreamOnlineEvent(payload)) {
          console.info("EventSub stream online received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
          });
          await markChannelLiveAndReconcile(
            runtimeEnv,
            payload.event.broadcaster_user_id
          );
          return new Response("Accepted", { status: 202 });
        }

        if (isStreamOfflineEvent(payload)) {
          console.info("EventSub stream offline received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
          });
          await markChannelOfflineAndReconcile(
            runtimeEnv,
            payload.event.broadcaster_user_id
          );
          return new Response("Accepted", { status: 202 });
        }

        if (!isChatMessageEvent(payload)) {
          console.info(
            "EventSub payload ignored because it was not a supported event"
          );
          return new Response("Ignored", { status: 202 });
        }

        const event = normalizeChatEvent(payload.event);
        console.info("EventSub chat message received", {
          broadcasterLogin: event.broadcasterLogin,
          chatterLogin: event.chatterLogin,
          rawMessage: event.rawMessage,
        });

        const channel = await chatDeps.getChannelByLogin(
          runtimeEnv,
          event.broadcasterLogin
        );
        if (!channel) {
          console.error("EventSub channel lookup failed", {
            broadcasterLogin: event.broadcasterLogin,
          });
          return new Response("Channel not found", { status: 202 });
        }

        const settings = await getChannelSettingsByChannelId(
          runtimeEnv,
          channel.id
        );
        if (!settings) {
          return new Response("Ignored", { status: 202 });
        }

        const parsed = parseChatCommand(
          event.rawMessage,
          normalizeCommandPrefix(settings.commandPrefix)
        );
        if (!parsed) {
          console.info(
            "EventSub chat message ignored because it was not a supported command"
          );
          return new Response("Ignored", { status: 202 });
        }

        const result = await processEventSubChatMessage({
          env: runtimeEnv,
          event,
          parsed,
          deps: chatDeps,
          channel,
        });

        return new Response(result.body, { status: result.status });
      },
    },
  },
});
