import { describe, expect, it } from "vitest";
import { getTwitchEmbedParentHost } from "~/lib/twitch/embed";

describe("getTwitchEmbedParentHost", () => {
  it("normalizes the hostname for Twitch parent matching", () => {
    expect(
      getTwitchEmbedParentHost(
        new URL("https://Dev.ItsaUnix.Systems:9000/home?tab=live")
      )
    ).toBe("dev.itsaunix.systems");
  });

  it("returns null when the hostname is blank", () => {
    expect(
      getTwitchEmbedParentHost({
        hostname: "   ",
      } as Pick<Location, "hostname">)
    ).toBeNull();
  });
});
