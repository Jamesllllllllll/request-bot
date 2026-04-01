import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
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

  it("falls back to a simplified multi-token query when the main any-field search still fails", async () => {
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
      .mockRejectedValueOnce(new Error("Failed query: SELECT complex search"))
      .mockRejectedValueOnce(new Error("Failed query: SELECT complex search"))
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([
        {
          id: "song-2",
          sourceSongId: 99078,
          groupedProjectId: null,
          artistId: 443,
          authorId: 282415,
          title: "On My Soul",
          artistName: "Bruno Mars",
          albumName: "The Romantic",
          creatorName: "Djpavs",
          tuningSummary: "E Standard",
          partsJson: '["lead","rhythm","bass","voice"]',
          durationText: "2:54",
          durationSeconds: 174,
          year: 2026,
          sourceUpdatedAt: 1773273600000,
          downloads: 115,
          hasLyrics: 1,
          source: "library",
          relevance: 40,
        },
      ]);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "Bruno Mars",
        page: 1,
        pageSize: 1,
        sortBy: "updated",
        sortDirection: "desc",
        year: [2026],
      })
    ).resolves.toMatchObject({
      total: 1,
      hiddenBlacklistedCount: 0,
      results: [
        {
          id: "song-2",
          title: "On My Soul",
          artist: "Bruno Mars",
          album: "The Romantic",
          year: 2026,
        },
      ],
    });

    expect(dbAll).toHaveBeenCalledTimes(6);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[1]?.[0]).toBe(
      "Catalog search retrying with simplified multi-token query"
    );

    warnSpy.mockRestore();
  });

  it("groups advanced text filters before combining them with year filters", async () => {
    const capturedSql: unknown[] = [];
    const dbAll = vi.fn().mockImplementation((query) => {
      capturedSql.push(query);

      if (capturedSql.length === 1) {
        return Promise.resolve([{ count: 0 }]);
      }

      return Promise.resolve([]);
    });

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "Bruno",
        artist: "Bruno Mars",
        year: [2024],
        page: 1,
        pageSize: 1,
        sortBy: "updated",
        sortDirection: "desc",
      })
    ).resolves.toMatchObject({
      total: 0,
      results: [],
    });

    const dialect = new SQLiteAsyncDialect();
    const totalQuery = dialect.sqlToQuery(capturedSql[0] as never);

    expect(totalQuery.sql).toMatch(
      /\(lower\(coalesce\("catalog_songs"\."artist_name", ''\)\) LIKE \? OR lower\(coalesce\("catalog_songs"\."artist_name", ''\)\) LIKE \?\) AND \("catalog_songs"\."year" = \?\)/
    );
  });
});
