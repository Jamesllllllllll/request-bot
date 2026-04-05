import { describe, expect, it } from "vitest";
import {
  formatPlaylistItemSummaryLine,
  getResolvedPlaylistCandidates,
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

  it("sorts resolved candidates by newest updated date and normalizes source URLs", () => {
    const resolved = getResolvedPlaylistCandidates({
      id: "item-1",
      songTitle: "Neon Noir",
      songAlbum: "Neon Noir",
      candidateMatchesJson: JSON.stringify([
        {
          id: "older",
          title: "Neon Noir",
          artist: "VV",
          creator: "JohnCryx",
          sourceUpdatedAt: 100,
          sourceId: 99081,
        },
        {
          id: "newer",
          title: "Neon Noir",
          artist: "VV",
          creator: "AltCharter",
          sourceUpdatedAt: 200,
          sourceId: 99142,
        },
      ]),
    });

    expect(resolved.map((candidate) => candidate.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(resolved[0]?.album).toBe("Neon Noir");
    expect(resolved[0]?.sourceUrl).toContain("/cdlc/99142");
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
});
