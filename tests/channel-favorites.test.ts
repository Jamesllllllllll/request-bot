import { describe, expect, it } from "vitest";
import { rollupFavoriteCharts } from "~/lib/channel-favorites";

describe("rollupFavoriteCharts", () => {
  it("rolls up chart favorites to the song level and prefers a requestable chart", () => {
    const results = rollupFavoriteCharts(
      [
        {
          id: "chart-blocked",
          favoritedAt: 2_000,
          groupedProjectId: 77,
          artistId: 11,
          authorId: 99,
          sourceId: 5_001,
          title: "Everlong",
          artist: "Foo Fighters",
          creator: "Blocked Charter",
          source: "custom",
        },
        {
          id: "chart-allowed",
          favoritedAt: 1_000,
          groupedProjectId: 77,
          artistId: 11,
          authorId: 55,
          sourceId: 5_002,
          title: "Everlong",
          artist: "Foo Fighters",
          creator: "Allowed Charter",
          source: "custom",
        },
      ],
      {
        artists: [],
        charters: [{ charterId: 99, charterName: "Blocked Charter" }],
        songs: [],
        songGroups: [],
      }
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "chart-allowed",
      chartCount: 2,
      latestFavoritedAt: 2_000,
      groupedProjectId: 77,
      title: "Everlong",
      artist: "Foo Fighters",
    });
  });

  it("falls back to artist and title when a grouped song id is unavailable", () => {
    const results = rollupFavoriteCharts(
      [
        {
          id: "chart-1",
          favoritedAt: 1_000,
          sourceId: 101,
          title: "The Pretender",
          artist: "Foo Fighters",
          source: "custom",
        },
        {
          id: "chart-2",
          favoritedAt: 1_500,
          sourceId: 202,
          title: "The Pretender",
          artist: "Foo Fighters",
          source: "custom",
        },
      ],
      {
        artists: [],
        charters: [],
        songs: [],
        songGroups: [],
      }
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "chart-2",
      chartCount: 2,
      latestFavoritedAt: 1_500,
      title: "The Pretender",
      artist: "Foo Fighters",
    });
  });
});
