import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
}));

import {
  hasAllowedRocksmithCategory,
  isEligibleRocksmithDemoSearchChannel,
} from "~/routes/api/channels/live";

describe("homepage Rocksmith demo filtering", () => {
  it("allows Music and Rocksmith-family categories", () => {
    expect(hasAllowedRocksmithCategory("Music")).toBe(true);
    expect(
      hasAllowedRocksmithCategory("Rocksmith 2014 Edition - Remastered")
    ).toBe(true);
    expect(hasAllowedRocksmithCategory("Rocksmith+")).toBe(true);
  });

  it("rejects unrelated live categories even when the Rocksmith tag is present", () => {
    expect(
      isEligibleRocksmithDemoSearchChannel({
        id: "channel-1",
        broadcaster_login: "tagged_pubg",
        display_name: "Tagged PUBG",
        thumbnail_url: "https://example.com/thumb.jpg",
        is_live: true,
        game_name: "PUBG: BATTLEGROUNDS",
        tags: ["rocksmith2014"],
        title: "Not actually a Rocksmith stream",
      })
    ).toBe(false);
  });

  it("still requires a Rocksmith tag for discovered search channels", () => {
    expect(
      isEligibleRocksmithDemoSearchChannel({
        id: "channel-2",
        broadcaster_login: "music_only",
        display_name: "Music Only",
        thumbnail_url: "https://example.com/thumb.jpg",
        is_live: true,
        game_name: "Music",
        tags: [],
        title: "Just chatting with music",
      })
    ).toBe(false);
  });
});
