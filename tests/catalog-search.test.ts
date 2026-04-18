import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "~/lib/db/client";
import {
  getCatalogSongGroupRowsForSongIds,
  searchCatalogSongs,
} from "~/lib/db/repositories";

function toGroupingRow(row: {
  id: string;
  sourceSongId: number;
  groupedProjectId: number | null;
  canonicalGroupKey?: string | null;
  canonicalGroupingSource?: "groupedProjectId" | "fallback" | "both" | null;
  artistId: number | null;
  authorId: number | null;
  title: string;
  artistName: string;
  albumName: string | null;
  creatorName: string | null;
  tuningSummary: string | null;
  partsJson: string;
  durationText: string | null;
  durationSeconds: number | null;
  year: number | null;
  sourceUpdatedAt: number | null;
  downloads: number;
  hasLyrics: number;
  source: string;
}) {
  return {
    ...row,
    canonicalGroupKey: row.canonicalGroupKey ?? null,
    canonicalGroupingSource: row.canonicalGroupingSource ?? null,
    leadTuningId: null,
    leadTuningName: null,
    rhythmTuningId: null,
    rhythmTuningName: null,
    bassTuningId: null,
    bassTuningName: null,
    altLeadTuningId: null,
    altRhythmTuningId: null,
    altBassTuningId: null,
    bonusLeadTuningId: null,
    bonusRhythmTuningId: null,
    bonusBassTuningId: null,
  };
}

describe("searchCatalogSongs", () => {
  const env = {} as AppEnv;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty result for a blank browse request without explicit filters", async () => {
    const dbAll = vi.fn();

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
    } as never);

    await expect(
      searchCatalogSongs(env, {
        page: 1,
        pageSize: 20,
        sortBy: "updated",
        sortDirection: "desc",
      })
    ).resolves.toEqual({
      results: [],
      total: 0,
      hiddenBlacklistedCount: 0,
      page: 1,
      pageSize: 20,
      hasNextPage: false,
    });

    expect(dbAll).not.toHaveBeenCalled();
  });

  it("falls back to LIKE-only search when the FTS MATCH query fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const matchedRows = [
      {
        id: "song-1",
        sourceSongId: 12345,
        groupedProjectId: null,
        artistId: 77,
        authorId: 88,
        title: "Signal Bloom",
        artistName: "The Example Band",
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
    ];
    const dbAll = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Failed query: SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ?"
        )
      )
      .mockResolvedValueOnce(matchedRows)
      .mockResolvedValueOnce(matchedRows.map((row) => toGroupingRow(row)));
    const dbFindMany = vi
      .fn()
      .mockResolvedValue(matchedRows.map((row) => toGroupingRow(row)));

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "Example Band",
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
          title: "Signal Bloom",
          artist: "The Example Band",
        },
      ],
    });

    expect(dbAll).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it("chunks grouped-song seed lookups to stay under the D1 SQL variable limit", async () => {
    const songIds = Array.from({ length: 181 }, (_, index) => `song-${index}`);
    const groupingRows = songIds.map((songId, index) =>
      toGroupingRow({
        id: songId,
        sourceSongId: index + 1,
        groupedProjectId: null,
        artistId: null,
        authorId: null,
        title: "",
        artistName: "",
        albumName: null,
        creatorName: null,
        tuningSummary: null,
        partsJson: "[]",
        durationText: null,
        durationSeconds: null,
        year: null,
        sourceUpdatedAt: null,
        downloads: 0,
        hasLyrics: 0,
        source: "library",
      })
    );
    const dbFindMany = vi
      .fn()
      .mockResolvedValueOnce(groupingRows.slice(0, 90))
      .mockResolvedValueOnce(groupingRows.slice(90, 180))
      .mockResolvedValueOnce(groupingRows.slice(180));
    const dbAll = vi.fn().mockResolvedValue([]);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
    } as never);

    await expect(
      getCatalogSongGroupRowsForSongIds(env, songIds)
    ).resolves.toHaveLength(181);

    expect(dbFindMany).toHaveBeenCalledTimes(3);
    expect(dbAll).not.toHaveBeenCalled();
  });

  it("falls back to a simplified multi-token query when the main any-field search still fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const matchedRows = [
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
    ];
    const dbAll = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Failed query: SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ?"
        )
      )
      .mockRejectedValueOnce(new Error("Failed query: SELECT complex search"))
      .mockResolvedValueOnce(matchedRows)
      .mockResolvedValueOnce(matchedRows.map((row) => toGroupingRow(row)));
    const dbFindMany = vi
      .fn()
      .mockResolvedValue(matchedRows.map((row) => toGroupingRow(row)));

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
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

    expect(dbAll).toHaveBeenCalledTimes(4);
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
    const dbFindMany = vi.fn().mockResolvedValue([]);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
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

  it("splits multi-tuning summaries for advanced and policy tuning filters", async () => {
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
        tuning: ["A Drop G"],
        allowedTuningsFilter: ["A Drop G", "B Drop A"],
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

    expect(totalQuery.sql).toContain("json_each");
    expect(totalQuery.sql).toContain("EXISTS");
    expect(totalQuery.sql).toContain("NOT EXISTS");
    expect(totalQuery.sql).not.toContain(
      `lower(trim(coalesce("catalog_songs"."tuning_summary", ''))) IN`
    );
  });

  it("keeps multi-token blacklist searches under the D1 variable limit", async () => {
    const capturedSql: unknown[] = [];
    const dbAll = vi.fn().mockImplementation((query) => {
      capturedSql.push(query);
      return Promise.resolve([]);
    });

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "take me home",
        parts: ["lead"],
        allowedTuningsFilter: [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 32,
          33, 34, 35, 43, 56, 57, 58, 59, 60, 61, 62, 63,
        ],
        excludeSongIds: [99077, 99080],
        excludeArtistIds: [
          8871, 10494, 7311, 7235, 15666, 9141, 15756, 165, 3931, 5790, 469,
          424,
        ],
        excludeArtistNames: [
          "aerosmith gareth evans",
          "brian may ft nathan evans",
          "castlevania",
          "castlevania ii simon s quest",
          "dolly spartans",
          "eva simons",
          "eva under fire",
          "evanescence",
          "evans blue",
          "sparta",
          "the hooters",
          "the offspring",
        ],
        excludeAuthorIds: [2638],
        excludeCreatorNames: ["hikikomori"],
        page: 1,
        pageSize: 10,
        sortBy: "relevance",
        sortDirection: "desc",
      })
    ).resolves.toMatchObject({
      total: 0,
      results: [],
    });

    const dialect = new SQLiteAsyncDialect();
    const rowsQuery = dialect.sqlToQuery(capturedSql[0] as never);

    expect(rowsQuery.params.length).toBeLessThan(100);
    expect(rowsQuery.sql).toContain("json_each(?)");
  });

  it("prioritizes preferred charters in ranking and exposes the flag in results", async () => {
    const capturedSql: unknown[] = [];
    const matchedRows = [
      {
        id: "song-preferred",
        sourceSongId: 321,
        groupedProjectId: 11,
        artistId: 77,
        authorId: 42,
        title: "Preferred Song",
        artistName: "Artist",
        albumName: "Album",
        creatorName: "FavCharter",
        tuningSummary: "E Standard",
        partsJson: '["lead"]',
        durationText: "3:30",
        durationSeconds: 210,
        year: 2025,
        sourceUpdatedAt: 2,
        downloads: 100,
        hasLyrics: 1,
        source: "library",
        isPreferredCharter: 1,
        relevance: 90,
      },
      {
        id: "song-neutral",
        sourceSongId: 322,
        groupedProjectId: 12,
        artistId: 78,
        authorId: 99,
        title: "Neutral Song",
        artistName: "Artist",
        albumName: "Album",
        creatorName: "OtherCharter",
        tuningSummary: "E Standard",
        partsJson: '["lead"]',
        durationText: "3:45",
        durationSeconds: 225,
        year: 2025,
        sourceUpdatedAt: 1,
        downloads: 50,
        hasLyrics: 0,
        source: "library",
        isPreferredCharter: 0,
        relevance: 90,
      },
    ];
    const dbAll = vi.fn().mockImplementation((query) => {
      capturedSql.push(query);

      if (capturedSql.length === 1) {
        return Promise.resolve(matchedRows);
      }

      return Promise.resolve(matchedRows.map((row) => toGroupingRow(row)));
    });
    const dbFindMany = vi
      .fn()
      .mockResolvedValue(matchedRows.map((row) => toGroupingRow(row)));

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "song",
        preferredAuthorIds: [42],
        preferredCreatorNames: ["FavCharter"],
        page: 1,
        pageSize: 2,
        sortBy: "relevance",
        sortDirection: "desc",
      })
    ).resolves.toMatchObject({
      total: 2,
      results: [
        {
          id: "song-preferred",
          isPreferredCharter: true,
        },
        {
          id: "song-neutral",
          isPreferredCharter: false,
        },
      ],
    });

    const dialect = new SQLiteAsyncDialect();
    const rowsQuery = dialect.sqlToQuery(capturedSql[0] as never);

    expect(rowsQuery.sql).toContain("AS isPreferredCharter");
  });

  it("expands grouped search results to include fallback-grouped sibling versions", async () => {
    const matchedRows = [
      {
        id: "song-main",
        sourceSongId: 99001,
        groupedProjectId: null,
        artistId: 77,
        authorId: 42,
        title: "Velvet Static",
        artistName: "The Example Band",
        albumName: "Siamese Dream",
        creatorName: "Charter One",
        tuningSummary: "E Standard",
        partsJson: '["lead"]',
        durationText: "5:17",
        durationSeconds: 317,
        year: 1993,
        sourceUpdatedAt: 2,
        downloads: 300,
        hasLyrics: 1,
        source: "library",
        isPreferredCharter: 0,
        relevance: 90,
      },
    ];
    const dbAll = vi
      .fn()
      .mockResolvedValueOnce(matchedRows)
      .mockResolvedValueOnce([
        toGroupingRow(matchedRows[0]),
        {
          id: "song-alt",
          sourceSongId: 99002,
          groupedProjectId: null,
          artistId: 77,
          authorId: 99,
          title: "Velvet Static",
          artistName: "Example Band",
          albumName: "Siamese Dream",
          creatorName: "Charter Two",
          tuningSummary: "Eb Standard",
          leadTuningId: null,
          leadTuningName: null,
          rhythmTuningId: null,
          rhythmTuningName: null,
          bassTuningId: null,
          bassTuningName: null,
          altLeadTuningId: null,
          altRhythmTuningId: null,
          altBassTuningId: null,
          bonusLeadTuningId: null,
          bonusRhythmTuningId: null,
          bonusBassTuningId: null,
          partsJson: '["rhythm"]',
          durationText: "5:17",
          durationSeconds: 317,
          year: 1993,
          sourceUpdatedAt: 1,
          downloads: 250,
          hasLyrics: 1,
          source: "library",
        },
      ]);
    const dbFindMany = vi.fn().mockResolvedValue([
      toGroupingRow(matchedRows[0]),
      {
        id: "song-alt",
        sourceSongId: 99002,
        groupedProjectId: null,
        artistId: 77,
        authorId: 99,
        title: "Velvet Static",
        artistName: "Example Band",
        albumName: "Siamese Dream",
        creatorName: "Charter Two",
        tuningSummary: "Eb Standard",
        leadTuningId: null,
        leadTuningName: null,
        rhythmTuningId: null,
        rhythmTuningName: null,
        bassTuningId: null,
        bassTuningName: null,
        altLeadTuningId: null,
        altRhythmTuningId: null,
        altBassTuningId: null,
        bonusLeadTuningId: null,
        bonusRhythmTuningId: null,
        bonusBassTuningId: null,
        partsJson: '["rhythm"]',
        durationText: "5:17",
        durationSeconds: 317,
        year: 1993,
        sourceUpdatedAt: 1,
        downloads: 250,
        hasLyrics: 1,
        source: "library",
      },
    ]);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "Velvet Static",
        page: 1,
        pageSize: 10,
        sortBy: "relevance",
        sortDirection: "desc",
      })
    ).resolves.toMatchObject({
      total: 1,
      results: [
        {
          id: "song-main",
          versionCount: 2,
          groupingSource: "fallback",
          tuning: "E Standard | Eb Standard",
        },
      ],
    });
  });

  it("uses stored canonical groups when present instead of fallback graph expansion", async () => {
    const matchedRows = [
      {
        id: "song-main",
        sourceSongId: 99001,
        groupedProjectId: null,
        canonicalGroupKey: "fallback:song-main",
        canonicalGroupingSource: "fallback" as const,
        artistId: 77,
        authorId: 42,
        title: "Velvet Static",
        artistName: "The Example Band",
        albumName: "Siamese Dream",
        creatorName: "Charter One",
        tuningSummary: "E Standard",
        partsJson: '["lead"]',
        durationText: "5:17",
        durationSeconds: 317,
        year: 1993,
        sourceUpdatedAt: 2,
        downloads: 300,
        hasLyrics: 1,
        source: "library",
        isPreferredCharter: 0,
        relevance: 90,
      },
    ];
    const siblingRows = [
      toGroupingRow(matchedRows[0]),
      toGroupingRow({
        id: "song-alt",
        sourceSongId: 99002,
        groupedProjectId: null,
        canonicalGroupKey: "fallback:song-main",
        canonicalGroupingSource: "fallback",
        artistId: 77,
        authorId: 99,
        title: "Velvet Static",
        artistName: "Example Band",
        albumName: "Siamese Dream",
        creatorName: "Charter Two",
        tuningSummary: "Eb Standard",
        partsJson: '["rhythm"]',
        durationText: "5:17",
        durationSeconds: 317,
        year: 1993,
        sourceUpdatedAt: 1,
        downloads: 250,
        hasLyrics: 1,
        source: "library",
      }),
    ];
    const dbAll = vi.fn().mockResolvedValueOnce(matchedRows);
    const dbFindMany = vi
      .fn()
      .mockResolvedValueOnce([toGroupingRow(matchedRows[0])])
      .mockResolvedValueOnce(siblingRows);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        catalogSongs: {
          findMany: dbFindMany,
        },
      },
    } as never);

    await expect(
      searchCatalogSongs(env, {
        query: "Velvet Static",
        page: 1,
        pageSize: 10,
        sortBy: "relevance",
        sortDirection: "desc",
      })
    ).resolves.toMatchObject({
      total: 1,
      results: [
        {
          id: "song-main",
          versionCount: 2,
          groupingSource: "fallback",
        },
      ],
    });

    expect(dbAll).toHaveBeenCalledTimes(1);
    expect(dbFindMany).toHaveBeenCalledTimes(2);
  });
});
