import { describe, expect, it } from "vitest";
import {
  parseExtensionPanelPubSubMessage,
  shouldRefreshPanelSearchFromPubSub,
} from "~/extension/panel/pubsub";

describe("extension panel PubSub helpers", () => {
  it("parses application/json playlist invalidation messages", () => {
    expect(
      parseExtensionPanelPubSubMessage({
        contentType: "application/json",
        message: JSON.stringify({
          type: "playlist.invalidate",
          reason: "blacklist",
          emittedAt: 1234,
        }),
      })
    ).toEqual({
      type: "playlist.invalidate",
      reason: "blacklist",
      emittedAt: 1234,
    });
  });

  it("ignores unexpected content types and payloads", () => {
    expect(
      parseExtensionPanelPubSubMessage({
        contentType: "text/plain",
        message: "hello",
      })
    ).toBeNull();
    expect(
      parseExtensionPanelPubSubMessage({
        contentType: "application/json",
        message: JSON.stringify({
          type: "other",
          reason: "playlist",
          emittedAt: 1234,
        }),
      })
    ).toBeNull();
  });

  it("marks search-affecting reasons for refresh", () => {
    expect(shouldRefreshPanelSearchFromPubSub("settings")).toBe(true);
    expect(shouldRefreshPanelSearchFromPubSub("blacklist")).toBe(true);
    expect(shouldRefreshPanelSearchFromPubSub("playlist")).toBe(false);
  });
});
