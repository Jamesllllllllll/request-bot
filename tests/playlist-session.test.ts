import { describe, expect, it } from "vitest";
import { filterPlayedSongsSinceReset } from "~/lib/playlist/session";

describe("filterPlayedSongsSinceReset", () => {
  it("keeps all songs when no session reset has happened", () => {
    expect(
      filterPlayedSongsSinceReset(
        [
          { id: "played_1", playedAt: 1_000 },
          { id: "played_2", playedAt: 2_000 },
        ],
        null
      )
    ).toEqual([
      { id: "played_1", playedAt: 1_000 },
      { id: "played_2", playedAt: 2_000 },
    ]);
  });

  it("drops songs from before the latest session reset", () => {
    expect(
      filterPlayedSongsSinceReset(
        [
          { id: "played_1", playedAt: 1_000 },
          { id: "played_2", playedAt: 2_000 },
          { id: "played_3", playedAt: 3_000 },
        ],
        2_000
      )
    ).toEqual([{ id: "played_3", playedAt: 3_000 }]);
  });

  it("falls back to createdAt when a played timestamp is missing", () => {
    expect(
      filterPlayedSongsSinceReset(
        [
          { id: "played_1", createdAt: 1_000 },
          { id: "played_2", createdAt: 3_000 },
        ],
        2_000
      )
    ).toEqual([{ id: "played_2", createdAt: 3_000 }]);
  });
});
