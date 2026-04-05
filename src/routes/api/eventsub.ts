// Route: Receives Twitch EventSub webhooks and dispatches channel events.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getChannelSettingsByChannelId } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  createEventSubChatDependencies,
  processEventSubChatMessage,
} from "~/lib/eventsub/chat-message";
import {
  createEventSubStreamLifecycleDependencies,
  processEventSubStreamOffline,
  processEventSubStreamOnline,
} from "~/lib/eventsub/stream-lifecycle";
import {
  createEventSubSupportDependencies,
  processEventSubChannelCheer,
  processEventSubChannelPointRewardRedemption,
  processEventSubChannelRaid,
  processEventSubChannelSubscribe,
  processEventSubSubscriptionGift,
  processEventSubSubscriptionMessage,
} from "~/lib/eventsub/support-events";
import { normalizeCommandPrefix } from "~/lib/request-policy";
import { normalizeChatEvent, parseChatCommand } from "~/lib/requests";
import {
  isChannelCheerEvent,
  isChannelPointRewardRedemptionEvent,
  isChannelRaidEvent,
  isChannelSubscribeEvent,
  isChannelSubscriptionMessageEvent,
  isChatMessageEvent,
  isStreamOfflineEvent,
  isStreamOnlineEvent,
  isSubscriptionGiftEvent,
} from "~/lib/twitch/api";
import { verifyEventSubSignature } from "~/lib/twitch/eventsub";

const chatDeps = createEventSubChatDependencies();
const streamLifecycleDeps = createEventSubStreamLifecycleDependencies();
const supportDeps = createEventSubSupportDependencies();

export const Route = createFileRoute("/api/eventsub")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const bodyText = await request.text();
        const messageType = request.headers.get("Twitch-Eventsub-Message-Type");
        const messageId = request.headers.get("Twitch-Eventsub-Message-Id");
        const messageRetry = request.headers.get(
          "Twitch-Eventsub-Message-Retry"
        );

        console.info("EventSub webhook received", {
          messageType,
          messageId,
          messageRetry,
          contentLength: bodyText.length,
        });

        if (!(await verifyEventSubSignature(request, runtimeEnv, bodyText))) {
          console.error("EventSub signature verification failed");
          return new Response("Invalid signature", { status: 401 });
        }

        const payload = JSON.parse(bodyText) as Record<string, unknown>;
        const subscriptionId =
          typeof payload.subscription === "object" &&
          payload.subscription !== null &&
          "id" in payload.subscription &&
          typeof payload.subscription.id === "string"
            ? payload.subscription.id
            : null;

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
          const result = await processEventSubStreamOnline({
            env: runtimeEnv,
            deps: streamLifecycleDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isStreamOfflineEvent(payload)) {
          console.info("EventSub stream offline received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
          });
          const result = await processEventSubStreamOffline({
            env: runtimeEnv,
            deps: streamLifecycleDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isSubscriptionGiftEvent(payload)) {
          console.info("EventSub subscription gift received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
            gifterLogin: payload.event.user_login ?? null,
            total: payload.event.total,
            isAnonymous: payload.event.is_anonymous,
          });
          const result = await processEventSubSubscriptionGift({
            env: runtimeEnv,
            deps: supportDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isChannelSubscribeEvent(payload)) {
          console.info("EventSub channel subscribe received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
            subscriberLogin: payload.event.user_login,
            isGift: payload.event.is_gift,
          });
          const result = await processEventSubChannelSubscribe({
            env: runtimeEnv,
            deps: supportDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isChannelSubscriptionMessageEvent(payload)) {
          console.info("EventSub subscription message received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
            subscriberLogin: payload.event.user_login,
            cumulativeMonths: payload.event.cumulative_months ?? null,
          });
          const result = await processEventSubSubscriptionMessage({
            env: runtimeEnv,
            deps: supportDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isChannelCheerEvent(payload)) {
          console.info("EventSub channel cheer received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
            cheererLogin: payload.event.user_login ?? null,
            bits: payload.event.bits,
            isAnonymous: payload.event.is_anonymous,
          });
          const result = await processEventSubChannelCheer({
            env: runtimeEnv,
            deps: supportDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isChannelPointRewardRedemptionEvent(payload)) {
          console.info("EventSub channel point reward redemption received", {
            broadcasterLogin: payload.event.broadcaster_user_login,
            viewerLogin: payload.event.user_login,
            rewardId: payload.event.reward.id,
            rewardTitle: payload.event.reward.title,
            redemptionId: payload.event.id,
          });
          const result = await processEventSubChannelPointRewardRedemption({
            env: runtimeEnv,
            deps: supportDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (isChannelRaidEvent(payload)) {
          console.info("EventSub channel raid received", {
            broadcasterLogin: payload.event.to_broadcaster_user_login,
            raiderLogin: payload.event.from_broadcaster_user_login,
            viewers: payload.event.viewers,
          });
          const result = await processEventSubChannelRaid({
            env: runtimeEnv,
            deps: supportDeps,
            messageId,
            event: payload.event,
          });
          return new Response(result.body, { status: result.status });
        }

        if (!isChatMessageEvent(payload)) {
          console.info(
            "EventSub payload ignored because it was not a supported event"
          );
          return new Response("Ignored", { status: 202 });
        }

        const event = normalizeChatEvent(payload.event);
        console.info("EventSub chat message received", {
          messageId,
          messageRetry,
          subscriptionId,
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
