import { describe, expect, it } from "vitest";
import {
  createExtensionPlaylistPubSubMessage,
  isPlaylistStreamNotifyReason,
  parseExtensionPlaylistPubSubMessage,
} from "~/lib/playlist/realtime";

describe("playlist realtime messaging", () => {
  it("creates and parses extension PubSub invalidation messages", () => {
    const message = createExtensionPlaylistPubSubMessage("settings", 1234);

    expect(
      parseExtensionPlaylistPubSubMessage(JSON.stringify(message))
    ).toEqual({
      type: "playlist.invalidate",
      reason: "settings",
      emittedAt: 1234,
    });
  });

  it("rejects invalid PubSub payloads", () => {
    expect(parseExtensionPlaylistPubSubMessage("not-json")).toBeNull();
    expect(
      parseExtensionPlaylistPubSubMessage(
        JSON.stringify({
          type: "playlist.invalidate",
          reason: "nope",
          emittedAt: Date.now(),
        })
      )
    ).toBeNull();
  });

  it("guards supported notify reasons", () => {
    expect(isPlaylistStreamNotifyReason("playlist")).toBe(true);
    expect(isPlaylistStreamNotifyReason("vip-tokens")).toBe(true);
    expect(isPlaylistStreamNotifyReason("unknown")).toBe(false);
  });
});
