import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "~/lib/db/client";
import { upsertUserAndChannel } from "~/lib/db/repositories";

describe("upsertUserAndChannel admin sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears admin on conflict updates when the user is no longer configured", async () => {
    const userConflictUpdate = vi.fn().mockResolvedValue(undefined);
    const channelConflictUpdate = vi.fn().mockResolvedValue(undefined);
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const userValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: userConflictUpdate,
    });
    const channelValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: channelConflictUpdate,
    });
    const noopValues = vi.fn().mockReturnValue({
      onConflictDoNothing,
    });
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: userValues })
      .mockReturnValueOnce({ values: channelValues })
      .mockReturnValueOnce({ values: noopValues })
      .mockReturnValueOnce({ values: noopValues });

    vi.mocked(getDb).mockReturnValue({
      insert,
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({
            id: "user-1",
            isAdmin: false,
          }),
        },
        channels: {
          findFirst: vi.fn().mockResolvedValue({
            id: "channel-1",
          }),
        },
      },
    } as never);

    await upsertUserAndChannel(
      {
        ADMIN_TWITCH_USER_IDS: "",
      } as AppEnv,
      {
        twitchUserId: "twitch-user-1",
        login: "streamer",
        displayName: "Streamer",
      }
    );

    expect(userConflictUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          isAdmin: false,
        }),
      })
    );
  });
});
