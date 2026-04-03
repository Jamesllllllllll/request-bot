import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("~/lib/twitch/api", () => ({
  getAppAccessToken: vi.fn(),
  getLiveStreams: vi.fn(),
  getModeratedChannels: vi.fn(),
  refreshAccessToken: vi.fn(),
  TwitchApiError: class MockTwitchApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly body?: string
    ) {
      super(message);
      this.name = "TwitchApiError";
    }
  },
}));

import { getDb } from "~/lib/db/client";
import {
  getBotAuthorization,
  saveTwitchAuthorization,
} from "~/lib/db/repositories";
import {
  decryptTwitchToken,
  encryptTwitchToken,
  isEncryptedTwitchToken,
} from "~/lib/twitch/token-encryption";

describe("twitch authorization storage", () => {
  const env = {
    TWITCH_CLIENT_SECRET: "client-secret",
    TWITCH_TOKEN_ENCRYPTION_SECRET: "token-secret",
  } as AppEnv;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts tokens before inserting twitch authorizations", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({
      onConflictDoUpdate,
    });
    const insert = vi.fn().mockReturnValue({
      values,
    });

    vi.mocked(getDb).mockReturnValue({
      insert,
    } as never);

    await saveTwitchAuthorization(env, {
      userId: "user-1",
      twitchUserId: "twitch-user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "bearer",
      scopes: ["channel:bot"],
      expiresAt: 123_456,
    });

    const inserted = values.mock.calls[0][0];
    expect(inserted.accessTokenEncrypted).not.toBe("access-token");
    expect(inserted.refreshTokenEncrypted).not.toBe("refresh-token");
    expect(isEncryptedTwitchToken(inserted.accessTokenEncrypted)).toBe(true);
    expect(isEncryptedTwitchToken(inserted.refreshTokenEncrypted)).toBe(true);

    const conflictUpdate = onConflictDoUpdate.mock.calls[0][0];
    expect(conflictUpdate.set.accessTokenEncrypted).not.toBe("access-token");
    expect(conflictUpdate.set.refreshTokenEncrypted).not.toBe("refresh-token");
  });

  it("decrypts stored tokens before returning an authorization to callers", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "auth-1",
      accessTokenEncrypted: await encryptTwitchToken(env, "access-token"),
      refreshTokenEncrypted: await encryptTwitchToken(env, "refresh-token"),
    });
    const update = vi.fn();

    vi.mocked(getDb).mockReturnValue({
      query: {
        twitchAuthorizations: {
          findFirst,
        },
      },
      update,
    } as never);

    const authorization = await getBotAuthorization(env);

    expect(authorization).toMatchObject({
      id: "auth-1",
      accessTokenEncrypted: "access-token",
      refreshTokenEncrypted: "refresh-token",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reencrypts legacy plaintext rows the next time they are read", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "auth-legacy",
      accessTokenEncrypted: "legacy-access-token",
      refreshTokenEncrypted: "legacy-refresh-token",
    });
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({
      where,
    });
    const update = vi.fn().mockReturnValue({
      set,
    });

    vi.mocked(getDb).mockReturnValue({
      query: {
        twitchAuthorizations: {
          findFirst,
        },
      },
      update,
    } as never);

    const authorization = await getBotAuthorization(env);

    expect(authorization).toMatchObject({
      id: "auth-legacy",
      accessTokenEncrypted: "legacy-access-token",
      refreshTokenEncrypted: "legacy-refresh-token",
    });
    expect(update).toHaveBeenCalledTimes(1);

    const encryptedUpdate = set.mock.calls[0][0];
    expect(encryptedUpdate.accessTokenEncrypted).not.toBe(
      "legacy-access-token"
    );
    expect(encryptedUpdate.refreshTokenEncrypted).not.toBe(
      "legacy-refresh-token"
    );
    expect(isEncryptedTwitchToken(encryptedUpdate.accessTokenEncrypted)).toBe(
      true
    );
    expect(isEncryptedTwitchToken(encryptedUpdate.refreshTokenEncrypted)).toBe(
      true
    );
  });

  it("can still decrypt rows written with the legacy client-secret key", async () => {
    const legacyEnv = {
      TWITCH_CLIENT_SECRET: "client-secret",
      TWITCH_TOKEN_ENCRYPTION_SECRET: "client-secret",
    } as AppEnv;
    const storedToken = await encryptTwitchToken(legacyEnv, "access-token");

    await expect(decryptTwitchToken(env, storedToken)).resolves.toBe(
      "access-token"
    );
  });
});
