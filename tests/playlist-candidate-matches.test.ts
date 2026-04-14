import { describe, expect, it } from "vitest";
import {
  buildPlaylistCandidateMatchesFromCatalogSongs,
  buildPlaylistCandidateMatchesFromSongSearchResults,
  buildPlaylistCandidateMatchesJson,
  getPreferredCharterSets,
  normalizeArtistNameForCandidateGrouping,
} from "~/lib/playlist/candidate-matches";

describe("playlist candidate matches", () => {
  it("builds grouped catalog candidates and prioritizes preferred charters", () => {
    const preferredCharterSets = getPreferredCharterSets([
      {
        charterId: 9205,
        charterName: "Mekanizm",
      },
    ]);

    const candidates = buildPlaylistCandidateMatchesFromCatalogSongs({
      songs: [
        {
          id: "song-alt",
          groupedProjectId: 123,
          authorId: 42,
          title: "Velvet Static",
          artistName: "The Example Band",
          albumName: "Siamese Dream",
          creatorName: "Another Charter",
          tuningSummary: "E Standard",
          partsJson: '["lead","bass"]',
          hasLyrics: 1,
          durationText: "5:17",
          year: 1993,
          sourceUpdatedAt: 1700000000000,
          downloads: 300,
          source: "library",
          sourceSongId: 99001,
        },
        {
          id: "song-preferred",
          groupedProjectId: 123,
          authorId: 9205,
          title: "Velvet Static",
          artistName: "The Example Band",
          albumName: "Siamese Dream",
          creatorName: "Mekanizm",
          tuningSummary: "E Standard",
          partsJson: '["lead","rhythm","bass"]',
          hasLyrics: 1,
          durationText: "5:17",
          year: 1993,
          sourceUpdatedAt: 1600000000000,
          downloads: 100,
          source: "library",
          sourceSongId: 99002,
        },
      ],
      preferredCharterIds: preferredCharterSets.ids,
      preferredCharterNames: preferredCharterSets.names,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      id: "song-preferred",
      isPreferredCharter: true,
      creator: "Mekanizm",
      parts: ["lead", "rhythm", "bass"],
    });
    expect(candidates[1]).toMatchObject({
      id: "song-alt",
      isPreferredCharter: false,
    });
  });

  it("returns undefined JSON for a single candidate and JSON for multiple", () => {
    expect(
      buildPlaylistCandidateMatchesJson([
        {
          id: "song-1",
          title: "Velvet Static",
        },
      ])
    ).toBeUndefined();

    expect(
      buildPlaylistCandidateMatchesJson([
        {
          id: "song-1",
          title: "Velvet Static",
        },
        {
          id: "song-2",
          title: "Velvet Static",
        },
      ])
    ).toContain('"song-2"');
  });

  it("maps song search results into playlist candidates", () => {
    const candidates = buildPlaylistCandidateMatchesFromSongSearchResults([
      {
        id: "song-1",
        groupedProjectId: 123,
        authorId: 9205,
        isPreferredCharter: true,
        title: "Velvet Static",
        artist: "The Example Band",
        album: "Siamese Dream",
        creator: "Mekanizm",
        tuning: "E Standard",
        parts: ["lead", "bass"],
        hasLyrics: true,
        durationText: "5:17",
        year: 1993,
        sourceUpdatedAt: 1700000000000,
        downloads: 999,
        sourceId: 99001,
        source: "library",
        sourceUrl: "https://ignition4.customsforge.com/cdlc/99001",
      },
    ]);

    expect(candidates).toEqual([
      expect.objectContaining({
        id: "song-1",
        groupedProjectId: 123,
        isPreferredCharter: true,
        creator: "Mekanizm",
        sourceId: 99001,
      }),
    ]);
  });

  it("normalizes artist names for fallback candidate grouping", () => {
    expect(normalizeArtistNameForCandidateGrouping("The Example Band")).toBe(
      "example band"
    );
    expect(normalizeArtistNameForCandidateGrouping("Example Band")).toBe(
      "example band"
    );
  });
});
