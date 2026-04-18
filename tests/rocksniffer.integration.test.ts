import { describe, expect, it } from "vitest";
import {
  buildRockSnifferAddonManifest,
  findRockSnifferPlaylistMatch,
  normalizeRockSnifferMatchValue,
  parseRockSnifferSongStartedEvent,
  ROCK_SNIFFER_ADDON_DOWNLOAD_FILENAME,
  ROCK_SNIFFER_ADDON_PACKAGE_DATE,
  resolveRockSnifferRelayPlan,
} from "~/lib/rocksniffer/integration";

describe("RockSniffer integration helpers", () => {
  describe("parseRockSnifferSongStartedEvent", () => {
    it("parses a valid song-start event payload", () => {
      const parsed = parseRockSnifferSongStartedEvent({
        event: "songStarted",
        observedAt: 123456,
        song: {
          id: "song-1",
          title: "The Trooper",
          artist: "Iron Maiden",
          album: "Piece of Mind",
          arrangement: "Lead",
          tuning: "E Standard",
          lengthSeconds: 245,
        },
      });

      expect(parsed).toEqual({
        event: "songStarted",
        observedAt: 123456,
        song: {
          id: "song-1",
          title: "The Trooper",
          artist: "Iron Maiden",
          album: "Piece of Mind",
          arrangement: "Lead",
          tuning: "E Standard",
          lengthSeconds: 245,
        },
      });
    });

    it("rejects payloads without a title and artist", () => {
      expect(
        parseRockSnifferSongStartedEvent({
          event: "songStarted",
          song: {
            title: " ",
            artist: "",
          },
        })
      ).toBeNull();
    });
  });

  describe("normalizeRockSnifferMatchValue", () => {
    it("normalizes punctuation, accents, and html entities", () => {
      expect(normalizeRockSnifferMatchValue("Beyonc&eacute; &amp; Jay-Z")).toBe(
        "beyonce and jay z"
      );
    });
  });

  describe("findRockSnifferPlaylistMatch", () => {
    it("matches a queued song after normalization", () => {
      const match = findRockSnifferPlaylistMatch(
        [
          {
            id: "pli_1",
            songTitle: "Rock 'n' Roll Train",
            songArtist: "AC/DC",
            status: "queued",
          },
        ],
        {
          title: "Rock n Roll Train",
          artist: "AC DC",
        }
      );

      expect(match).toEqual({
        status: "matched",
        item: {
          id: "pli_1",
          songTitle: "Rock 'n' Roll Train",
          songArtist: "AC/DC",
          status: "queued",
        },
      });
    });

    it("prefers an already-current exact match over duplicate queued matches", () => {
      const match = findRockSnifferPlaylistMatch(
        [
          {
            id: "pli_current",
            songTitle: "Painkiller",
            songArtist: "Judas Priest",
            status: "current",
          },
          {
            id: "pli_duplicate",
            songTitle: "Painkiller",
            songArtist: "Judas Priest",
            status: "queued",
          },
        ],
        {
          title: "Painkiller",
          artist: "Judas Priest",
        }
      );

      expect(match).toEqual({
        status: "already_current",
        item: {
          id: "pli_current",
          songTitle: "Painkiller",
          songArtist: "Judas Priest",
          status: "current",
        },
      });
    });

    it("returns ambiguous when multiple queued items match", () => {
      const match = findRockSnifferPlaylistMatch(
        [
          {
            id: "pli_1",
            songTitle: "Limelight",
            songArtist: "Rush",
            status: "queued",
          },
          {
            id: "pli_2",
            songTitle: "Limelight",
            songArtist: "Rush",
            status: "queued",
          },
        ],
        {
          title: "Limelight",
          artist: "Rush",
        }
      );

      expect(match).toEqual({
        status: "ambiguous",
        matches: [
          {
            id: "pli_1",
            songTitle: "Limelight",
            songArtist: "Rush",
            status: "queued",
          },
          {
            id: "pli_2",
            songTitle: "Limelight",
            songArtist: "Rush",
            status: "queued",
          },
        ],
      });
    });
  });

  describe("resolveRockSnifferRelayPlan", () => {
    it("marks the previous current song played before setting a new current match", () => {
      const match = findRockSnifferPlaylistMatch(
        [
          {
            id: "pli_current",
            songTitle: "Current song",
            songArtist: "Artist A",
            status: "current",
          },
          {
            id: "pli_next",
            songTitle: "Next song",
            songArtist: "Artist B",
            status: "queued",
          },
        ],
        {
          title: "Next song",
          artist: "Artist B",
        }
      );

      const plan = resolveRockSnifferRelayPlan({
        items: [
          {
            id: "pli_current",
            songTitle: "Current song",
            songArtist: "Artist A",
            status: "current",
          },
          {
            id: "pli_next",
            songTitle: "Next song",
            songArtist: "Artist B",
            status: "queued",
          },
        ],
        match,
      });

      expect(plan).toEqual({
        status: "mark_played_then_set_current",
        currentItem: {
          id: "pli_current",
          songTitle: "Current song",
          songArtist: "Artist A",
          status: "current",
        },
        item: {
          id: "pli_next",
          songTitle: "Next song",
          songArtist: "Artist B",
          status: "queued",
        },
      });
    });

    it("sets the matched song directly when nothing else is current", () => {
      const match = findRockSnifferPlaylistMatch(
        [
          {
            id: "pli_next",
            songTitle: "Next song",
            songArtist: "Artist B",
            status: "queued",
          },
        ],
        {
          title: "Next song",
          artist: "Artist B",
        }
      );

      const plan = resolveRockSnifferRelayPlan({
        items: [
          {
            id: "pli_next",
            songTitle: "Next song",
            songArtist: "Artist B",
            status: "queued",
          },
        ],
        match,
      });

      expect(plan).toEqual({
        status: "set_current",
        item: {
          id: "pli_next",
          songTitle: "Next song",
          songArtist: "Artist B",
          status: "queued",
        },
      });
    });
  });

  describe("buildRockSnifferAddonManifest", () => {
    it("returns the latest addon package", () => {
      const manifest = buildRockSnifferAddonManifest(
        "https://dev.itsaunix.systems"
      );

      expect(manifest.latest).toEqual({
        version: ROCK_SNIFFER_ADDON_PACKAGE_DATE,
        releasedAt: ROCK_SNIFFER_ADDON_PACKAGE_DATE,
        filename: ROCK_SNIFFER_ADDON_DOWNLOAD_FILENAME,
        downloadUrl: `https://dev.itsaunix.systems/rocksniffer-addon/${ROCK_SNIFFER_ADDON_DOWNLOAD_FILENAME}`,
      });
      expect("releases" in manifest).toBe(false);
    });
  });
});
