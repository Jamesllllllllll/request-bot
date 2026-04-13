import { describe, expect, it } from "vitest";
import {
  formatPlaylistItemSummaryLine,
  getPlaylistDisplayParts,
  getResolvedPlaylistCandidates,
  playlistDisplayCandidateHasLyrics,
  playlistDisplayItemHasLyrics,
} from "~/lib/playlist/management-display";

describe("playlist management display helpers", () => {
  it("keeps the creator in the summary line for single-version items", () => {
    expect(
      formatPlaylistItemSummaryLine({
        songArtist: "VV",
        songAlbum: "Neon Noir",
        songCreator: "JohnCryx",
      })
    ).toBe("VV · Neon Noir · Charted by JohnCryx");
  });

  it("omits the creator from the summary line when multiple versions exist", () => {
    expect(
      formatPlaylistItemSummaryLine(
        {
          songArtist: "VV",
          songAlbum: "Neon Noir",
          songCreator: "JohnCryx",
        },
        {
          hasMultipleVersions: true,
        }
      )
    ).toBe("VV · Neon Noir");
  });

  it("sorts resolved candidates by preferred charter, then newest update, then downloads", () => {
    const resolved = getResolvedPlaylistCandidates({
      id: "item-1",
      songTitle: "Neon Noir",
      songAlbum: "Neon Noir",
      candidateMatchesJson: JSON.stringify([
        {
          id: "preferred-older",
          title: "Neon Noir",
          artist: "VV",
          creator: "FavCharter",
          isPreferredCharter: true,
          sourceUpdatedAt: 150,
          downloads: 50,
          sourceId: 99040,
        },
        {
          id: "preferred-newer",
          title: "Neon Noir",
          artist: "VV",
          creator: "FavCharter",
          isPreferredCharter: true,
          sourceUpdatedAt: 250,
          downloads: 10,
          sourceId: 99041,
        },
        {
          id: "older",
          title: "Neon Noir",
          artist: "VV",
          creator: "JohnCryx",
          sourceUpdatedAt: 100,
          downloads: 500,
          sourceId: 99081,
        },
        {
          id: "newer",
          title: "Neon Noir",
          artist: "VV",
          creator: "AltCharter",
          sourceUpdatedAt: 200,
          downloads: 100,
          sourceId: 99142,
        },
        {
          id: "same-date-more-downloads",
          title: "Neon Noir",
          artist: "VV",
          creator: "AltCharter",
          sourceUpdatedAt: 200,
          downloads: 150,
          sourceId: 99143,
        },
      ]),
    });

    expect(resolved.map((candidate) => candidate.id)).toEqual([
      "preferred-newer",
      "preferred-older",
      "same-date-more-downloads",
      "newer",
      "older",
    ]);
    expect(resolved[0]?.album).toBe("Neon Noir");
    expect(resolved[0]?.sourceUrl).toContain("/cdlc/99041");
  });

  it("falls back to a single normalized candidate when no version list exists", () => {
    const resolved = getResolvedPlaylistCandidates({
      id: "item-1",
      songTitle: "Neon Noir",
      songArtist: "VV",
      songAlbum: "Neon Noir",
      songCharterId: 2638,
      songCreator: "JohnCryx",
      songTuning: "E Standard | A Standard",
      songPartsJson: JSON.stringify(["lead", "bass"]),
      songDurationText: "3:49",
      songSourceUpdatedAt: 300,
      songDownloads: 4284,
      songCatalogSourceId: 99081,
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: "item-1",
      authorId: 2638,
      title: "Neon Noir",
      artist: "VV",
      creator: "JohnCryx",
      parts: ["lead", "bass"],
      sourceUrl: expect.stringContaining("/cdlc/99081"),
    });
  });

  it("keeps lyrics as metadata instead of a display path", () => {
    expect(
      getPlaylistDisplayParts(["lead", "voice", "vocals", "bass"])
    ).toEqual(["lead", "bass"]);
    expect(
      playlistDisplayCandidateHasLyrics({
        parts: ["lead", "voice"],
      })
    ).toBe(true);
    expect(
      playlistDisplayItemHasLyrics({
        songHasLyrics: true,
        songPartsJson: JSON.stringify(["lead"]),
      })
    ).toBe(true);
  });
});
