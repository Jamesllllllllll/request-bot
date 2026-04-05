import { describe, expect, it } from "vitest";
import {
  parseRequesterChatBadges,
  resolveRequesterChatBadgesFromBadgeSets,
  serializeRequesterChatBadges,
} from "~/lib/twitch/chat-badges";

describe("requester chat badges", () => {
  it("prefers channel badge art before global fallback", () => {
    expect(
      resolveRequesterChatBadgesFromBadgeSets({
        references: [
          { setId: "moderator", versionId: "1" },
          { setId: "subscriber", versionId: "3", info: "3" },
          { setId: "unknown", versionId: "1" },
        ],
        channelBadgeSets: [
          {
            set_id: "subscriber",
            versions: [
              {
                id: "3",
                image_url_1x: "https://example.com/channel-sub-1x.png",
                image_url_2x: "https://example.com/channel-sub-2x.png",
                image_url_4x: "https://example.com/channel-sub-4x.png",
                title: "3-Month Subscriber",
                description: "3-Month Subscriber",
              },
            ],
          },
        ],
        globalBadgeSets: [
          {
            set_id: "moderator",
            versions: [
              {
                id: "1",
                image_url_1x: "https://example.com/mod-1x.png",
                image_url_2x: "https://example.com/mod-2x.png",
                image_url_4x: "https://example.com/mod-4x.png",
                title: "Moderator",
                description: "Moderator",
              },
            ],
          },
          {
            set_id: "subscriber",
            versions: [
              {
                id: "0",
                image_url_1x: "https://example.com/global-sub-1x.png",
                image_url_2x: "https://example.com/global-sub-2x.png",
                image_url_4x: "https://example.com/global-sub-4x.png",
                title: "Subscriber",
                description: "Subscriber",
              },
            ],
          },
        ],
      })
    ).toEqual([
      {
        setId: "moderator",
        versionId: "1",
        info: null,
        title: "Moderator",
        description: "Moderator",
        imageUrl1x: "https://example.com/mod-1x.png",
        imageUrl2x: "https://example.com/mod-2x.png",
        imageUrl4x: "https://example.com/mod-4x.png",
      },
      {
        setId: "subscriber",
        versionId: "3",
        info: "3",
        title: "3-Month Subscriber",
        description: "3-Month Subscriber",
        imageUrl1x: "https://example.com/channel-sub-1x.png",
        imageUrl2x: "https://example.com/channel-sub-2x.png",
        imageUrl4x: "https://example.com/channel-sub-4x.png",
      },
    ]);
  });

  it("round-trips stored badge payloads", () => {
    const badges = [
      {
        setId: "moderator",
        versionId: "1",
        info: null,
        title: "Moderator",
        description: "Moderator",
        imageUrl1x: "https://example.com/mod-1x.png",
        imageUrl2x: "https://example.com/mod-2x.png",
        imageUrl4x: "https://example.com/mod-4x.png",
      },
    ];

    expect(
      parseRequesterChatBadges(serializeRequesterChatBadges(badges))
    ).toEqual(badges);
  });
});
