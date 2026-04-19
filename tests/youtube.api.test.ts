import { describe, expect, it } from "vitest";
import { selectActiveYouTubeBroadcast } from "~/lib/youtube/api";

describe("selectActiveYouTubeBroadcast", () => {
  it("returns the first active broadcast that exposes a live chat id", () => {
    expect(
      selectActiveYouTubeBroadcast([
        {
          id: "broadcast-missing-chat",
          snippet: {
            title: "No chat yet",
          },
        },
        {
          id: "broadcast-live",
          snippet: {
            title: "Live now",
            liveChatId: "chat-123",
            publishedAt: "2026-04-18T20:00:00.000Z",
          },
        },
      ])
    ).toEqual({
      id: "broadcast-live",
      title: "Live now",
      liveChatId: "chat-123",
      publishedAt: "2026-04-18T20:00:00.000Z",
    });
  });

  it("returns null when there is no actionable active broadcast", () => {
    expect(
      selectActiveYouTubeBroadcast([
        {
          id: "broadcast-no-chat",
          snippet: {
            title: "Still preparing",
          },
        },
      ])
    ).toBeNull();
  });
});
