import { describe, expect, test } from "vitest";
import { parseSongsMasterGridOwnedOfficialDlc } from "~/lib/cfsm/songs-master-grid";

describe("parseSongsMasterGridOwnedOfficialDlc", () => {
  test("imports owned official rows and keeps their metadata", () => {
    const result = parseSongsMasterGridOwnedOfficialDlc(
      JSON.stringify({
        dgvSongsMaster: [
          {
            colKey: "PearEven",
            colRepairStatus: "ODLC",
            colTagged: "ODLC",
            colArtist: "Pearl Jam",
            colTitle: "Even Flow",
            colArtistTitleAlbumDate:
              "Pearl Jam;Even Flow;Ten;2017-02-23T11:57:00",
            colAppID: "590185",
            colFilePath: "Rocksmith2014/dlc/peareven_p.psarc",
            colArrangements: "Bass, Lead, Rhythm",
            colTunings: "Drop D, E Standard, Open D",
          },
          {
            colKey: "PearEven",
            colRepairStatus: "ODLC",
            colTagged: "ODLC",
            colArtist: "Pearl Jam",
            colTitle: "Even Flow",
          },
          {
            colKey: "tnabackinblack",
            colRepairStatus: "Repaired",
            colTagged: "False",
            colArtist: "AC/DC",
            colTitle: "Back In Black",
          },
          {
            colKey: "bach",
            colRepairStatus: "Repaired",
            colTagged: "ODLC",
            colArtist: "Johann Sebastian Bach",
            colTitle: '"Little" Fugue in G minor',
            colArtistTitleAlbumDate:
              'Johann Sebastian Bach;"Little" Fugue in G minor;Bachsmith;2014-07-16T16:12:00',
          },
        ],
      })
    );

    expect(result.totalRows).toBe(4);
    expect(result.ownedOfficialRows).toEqual([
      {
        sourceKey: "bach",
        sourceAppId: null,
        artistName: "Johann Sebastian Bach",
        title: '"Little" Fugue in G minor',
        albumName: "Bachsmith",
        filePath: null,
        arrangements: [],
        tunings: [],
      },
      {
        sourceKey: "PearEven",
        sourceAppId: "590185",
        artistName: "Pearl Jam",
        title: "Even Flow",
        albumName: "Ten",
        filePath: "Rocksmith2014/dlc/peareven_p.psarc",
        arrangements: ["Bass", "Lead", "Rhythm"],
        tunings: ["Drop D", "E Standard", "Open D"],
      },
    ]);
  });

  test("rejects files without the songs master list", () => {
    expect(() =>
      parseSongsMasterGridOwnedOfficialDlc(JSON.stringify({ songs: [] }))
    ).toThrow("SongsMasterGrid.json is missing the dgvSongsMaster list.");
  });
});
