import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";
import type { EventSubStreamLifecycleDependencies } from "~/lib/eventsub/stream-lifecycle";
import {
  processEventSubStreamOffline,
  processEventSubStreamOnline,
} from "~/lib/eventsub/stream-lifecycle";

function createDeps(
  overrides: Partial<EventSubStreamLifecycleDependencies> = {}
): EventSubStreamLifecycleDependencies {
  return {
    getChannelByTwitchChannelId: vi.fn().mockResolvedValue({
      id: "channel-1",
    }),
    claimEventSubDelivery: vi.fn().mockResolvedValue(true),
    markChannelLiveAndReconcile: vi.fn().mockResolvedValue(undefined),
    markChannelOfflineAndReconcile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("stream lifecycle EventSub automation", () => {
  const env = {} as AppEnv;

  it("claims stream.online deliveries before changing live state", async () => {
    const deps = createDeps();

    const result = await processEventSubStreamOnline({
      env,
      deps,
      messageId: "msg-1",
      event: {
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        id: "event-1",
        type: "live",
        started_at: "2026-04-03T12:00:00Z",
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.claimEventSubDelivery).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      messageId: "msg-1",
      subscriptionType: "stream.online",
    });
    expect(deps.markChannelLiveAndReconcile).toHaveBeenCalledWith(
      env,
      "broadcaster-1"
    );
  });

  it("ignores duplicate stream.offline deliveries", async () => {
    const deps = createDeps({
      claimEventSubDelivery: vi.fn().mockResolvedValue(false),
    });

    const result = await processEventSubStreamOffline({
      env,
      deps,
      messageId: "msg-2",
      event: {
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
      },
    });

    expect(result).toEqual({
      body: "Duplicate",
      status: 202,
    });
    expect(deps.markChannelOfflineAndReconcile).not.toHaveBeenCalled();
  });
});
