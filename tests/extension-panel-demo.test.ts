import { describe, expect, it } from "vitest";
import {
  applyDemoViewerRequestMutation,
  createMockModeratorPlaylistItems,
  getDemoViewerActiveRequests,
  mockModeratorViewerProfile,
} from "~/extension/panel/demo";

describe("extension panel demo state", () => {
  it("adds a queued request for the demo viewer", () => {
    const playlist = {
      currentItemId: "preview-current",
      items: createMockModeratorPlaylistItems(),
    };

    const next = applyDemoViewerRequestMutation({
      playlist,
      viewerProfile: mockModeratorViewerProfile,
      song: {
        id: "song-1",
        title: "Cherub Rock",
        artist: "Smashing Pumpkins",
        album: "Siamese Dream",
        creator: "CustomsForge",
        sourceId: 123,
      },
      requestKind: "regular",
      replaceExisting: false,
      now: 1_700_000_000_000,
      nextId: "preview-request-1",
    });

    const added = next.items.at(-1);

    expect(added).toMatchObject({
      id: "preview-request-1",
      songId: "song-1",
      songTitle: "Cherub Rock",
      songArtist: "Smashing Pumpkins",
      requestedByTwitchUserId: mockModeratorViewerProfile.twitchUserId,
      requestedByLogin: mockModeratorViewerProfile.login,
      requestKind: "regular",
      status: "queued",
    });
  });

  it("replaces the demo viewer active request when edit mode is enabled", () => {
    const playlist = {
      currentItemId: "preview-current",
      items: [
        ...createMockModeratorPlaylistItems(),
        {
          id: "viewer-request-1",
          songId: "song-old",
          songTitle: "Old Song",
          songArtist: "Old Artist",
          requestedByTwitchUserId: mockModeratorViewerProfile.twitchUserId,
          requestedByLogin: mockModeratorViewerProfile.login,
          requestedByDisplayName: mockModeratorViewerProfile.displayName,
          requestKind: "regular",
          createdAt: 100,
          updatedAt: 100,
          status: "queued",
          position: 5,
        },
      ],
    };

    const next = applyDemoViewerRequestMutation({
      playlist,
      viewerProfile: mockModeratorViewerProfile,
      song: {
        id: "song-new",
        title: "New Song",
        artist: "New Artist",
      },
      requestKind: "vip",
      replaceExisting: true,
      now: 1_700_000_000_100,
      nextId: "viewer-request-2",
    });

    expect(
      getDemoViewerActiveRequests(next, mockModeratorViewerProfile.twitchUserId)
    ).toEqual([
      expect.objectContaining({
        id: "viewer-request-2",
        songId: "song-new",
        requestKind: "vip",
      }),
    ]);
    expect(
      next.items.some(
        (item) => typeof item.id === "string" && item.id === "viewer-request-1"
      )
    ).toBe(false);
  });
});
