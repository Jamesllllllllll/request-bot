import { describe, expect, it } from "vitest";
import { extensionPlaylistMutationSchema } from "~/lib/validation";

describe("extensionPlaylistMutationSchema", () => {
  it("accepts manager manual-add payloads from the Twitch panel", () => {
    const parsed = extensionPlaylistMutationSchema.safeParse({
      action: "manualAdd",
      songId: "cat_c8f25ebdd52c4f08a2b647c023b0ae3f",
      requesterLogin: "jimmy_pants_",
      requesterTwitchUserId: "172957013",
      requesterDisplayName: "Jimmy_Pants_",
      title: "On My Soul",
      authorId: 282415,
      artist: "Bruno Mars",
      album: "The Romantic",
      creator: "Djpavs",
      tuning: "E Standard",
      parts: ["lead", "rhythm", "bass", "voice"],
      durationText: "2:54",
      source: "library",
      sourceUrl: "https://ignition4.customsforge.com/cdlc/99078",
      sourceId: 99078,
      candidateMatchesJson:
        '[{"id":"cat_c8f25ebdd52c4f08a2b647c023b0ae3f","artist":"Bruno Mars"}]',
    });

    expect(parsed.success).toBe(true);
  });
});
