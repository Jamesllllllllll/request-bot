import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "~/lib/db/client";
import { searchCatalogSongs } from "~/lib/db/repositories";

describe("searchCatalogSongs", () => {
  const env = {} as AppEnv;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to LIKE-only search when the FTS MATCH query fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dbAll = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Failed query: SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ?"
        )
      )
      .mockRejectedValueOnce(
        new Error(
          "Failed query: SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ?"
        )
      )
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([
        {
          id: "song-1",
          sourceSongId: 12345,
          groupedProjectId: null,
          artistId: 77,
          authorId: 88,
          title: "Cherub Rock",
          artistName: "The Smashing Pumpkins",
          albumName: "Siamese Dream",
          creatorName: "Charter",
          tuningSummary: "Eb Standard",
          partsJson: '["lead","rhythm"]',
          durationText: "4:58",
          durationSeconds: 298,
          year: 1993,
          sourceUpdatedAt: 1,
          downloads: 1000,
          hasLyrics: 1,
          source: "custom",
          relevance: 80,
        },
      ]);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "Smashing Pumpkins",
        page: 1,
        pageSize: 1,
        sortBy: "relevance",
        sortDirection: "desc",
      })
    ).resolves.toMatchObject({
      total: 1,
      hiddenBlacklistedCount: 0,
      results: [
        {
          id: "song-1",
          title: "Cherub Rock",
          artist: "The Smashing Pumpkins",
        },
      ],
    });

    expect(dbAll).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
