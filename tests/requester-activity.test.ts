import { describe, expect, it } from "vitest";
import {
  attachRequesterLastChatActivity,
  isRequesterInactive,
  mergeRequesterLastChatActivity,
  REQUESTER_INACTIVE_THRESHOLD_MS,
} from "~/lib/playlist/requester-activity";

describe("attachRequesterLastChatActivity", () => {
  it("matches requester activity by Twitch user ID first", () => {
    const items = [
      {
        id: "item-1",
        requestedByTwitchUserId: "viewer-1",
        requestedByLogin: "viewer_one",
      },
    ];

    expect(
      attachRequesterLastChatActivity(items, [
        {
          twitchUserId: "viewer-1",
          login: "viewer_one",
          lastChatAt: 123,
        },
      ])
    ).toEqual([
      {
        id: "item-1",
        requestedByTwitchUserId: "viewer-1",
        requestedByLogin: "viewer_one",
        requesterLastChatAt: 123,
      },
    ]);
  });

  it("falls back to login matching when a playlist item has no Twitch user ID", () => {
    const items = [
      {
        id: "item-2",
        requestedByLogin: "Viewer_One",
      },
    ];

    expect(
      attachRequesterLastChatActivity(items, [
        {
          twitchUserId: "viewer-1",
          login: "viewer_one",
          lastChatAt: 456,
        },
      ])
    ).toEqual([
      {
        id: "item-2",
        requestedByLogin: "Viewer_One",
        requesterLastChatAt: 456,
      },
    ]);
  });
});

describe("isRequesterInactive", () => {
  it("returns false until the inactivity threshold is reached", () => {
    const now = Date.parse("2026-04-14T18:30:00Z");

    expect(
      isRequesterInactive(now - REQUESTER_INACTIVE_THRESHOLD_MS + 1, now)
    ).toBe(false);
  });

  it("returns true once the inactivity threshold has elapsed", () => {
    const now = Date.parse("2026-04-14T18:30:00Z");

    expect(
      isRequesterInactive(now - REQUESTER_INACTIVE_THRESHOLD_MS, now)
    ).toBe(true);
  });
});

describe("mergeRequesterLastChatActivity", () => {
  it("patches matching items without replacing unrelated fields", () => {
    expect(
      mergeRequesterLastChatActivity(
        [
          {
            id: "item-1",
            songTitle: "Signal Bloom",
            requesterLastChatAt: 100,
          },
          {
            id: "item-2",
            songTitle: "Neon Noir",
          },
        ],
        [
          {
            id: "item-2",
            requesterLastChatAt: 500,
          },
        ]
      )
    ).toEqual([
      {
        id: "item-1",
        songTitle: "Signal Bloom",
        requesterLastChatAt: 100,
      },
      {
        id: "item-2",
        songTitle: "Neon Noir",
        requesterLastChatAt: 500,
      },
    ]);
  });
});
