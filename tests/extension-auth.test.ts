import { beforeEach, describe, expect, it } from "vitest";
import type { AppEnv } from "~/lib/env";
import {
  ExtensionAuthError,
  requireExtensionAuthFromRequest,
  verifyExtensionJwt,
} from "~/lib/server/extension-auth";

const encoder = new TextEncoder();
const sharedSecret = "dGVzdC1leHRlbnNpb24tc2VjcmV0";

describe("extension auth", () => {
  beforeEach(() => {
    // No shared state to reset yet.
  });

  it("verifies a linked viewer token", async () => {
    const token = await signExtensionJwt({
      channel_id: "12345",
      exp: Math.floor(Date.now() / 1000) + 300,
      role: "viewer",
      user_id: "viewer-1",
      opaque_user_id: "Uopaque-user",
      is_unlinked: false,
    });

    await expect(
      verifyExtensionJwt({
        token,
        sharedSecret,
      })
    ).resolves.toEqual({
      token,
      channelId: "12345",
      role: "viewer",
      viewerUserId: "viewer-1",
      opaqueUserId: "Uopaque-user",
      isLinked: true,
      exp: expect.any(Number),
    });
  });

  it("treats unlinked viewers as read-only auth", async () => {
    const token = await signExtensionJwt({
      channel_id: "12345",
      exp: Math.floor(Date.now() / 1000) + 300,
      role: "viewer",
      opaque_user_id: "Aanon-session",
      is_unlinked: true,
    });

    await expect(
      verifyExtensionJwt({
        token,
        sharedSecret,
      })
    ).resolves.toMatchObject({
      channelId: "12345",
      viewerUserId: null,
      opaqueUserId: "Aanon-session",
      isLinked: false,
    });
  });

  it("reads the token from request headers", async () => {
    const token = await signExtensionJwt({
      channel_id: "999",
      exp: Math.floor(Date.now() / 1000) + 300,
      role: "moderator",
      user_id: "viewer-2",
      opaque_user_id: "Umoderator",
      is_unlinked: false,
    });

    const request = new Request("https://example.com/api/extension/bootstrap", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    await expect(
      requireExtensionAuthFromRequest({
        env: {
          TWITCH_EXTENSION_SECRET: sharedSecret,
        } as Pick<AppEnv, "TWITCH_EXTENSION_SECRET">,
        request,
      })
    ).resolves.toMatchObject({
      channelId: "999",
      role: "moderator",
      viewerUserId: "viewer-2",
    });
  });

  it("returns a configured error when the extension secret is missing", async () => {
    const token = await signExtensionJwt({
      channel_id: "12345",
      exp: Math.floor(Date.now() / 1000) + 300,
      role: "viewer",
      user_id: "viewer-1",
      opaque_user_id: "Uopaque-user",
      is_unlinked: false,
    });

    const request = new Request("https://example.com/api/extension/bootstrap", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    await expect(
      requireExtensionAuthFromRequest({
        env: {
          TWITCH_EXTENSION_SECRET: undefined as unknown as string,
        } as Pick<AppEnv, "TWITCH_EXTENSION_SECRET">,
        request,
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "Twitch extension auth is not configured.",
    });
  });

  it("rejects expired tokens", async () => {
    const token = await signExtensionJwt({
      channel_id: "12345",
      exp: Math.floor(Date.now() / 1000) - 60,
      role: "viewer",
      user_id: "viewer-1",
      opaque_user_id: "Uopaque-user",
      is_unlinked: false,
    });

    await expect(
      verifyExtensionJwt({
        token,
        sharedSecret,
      })
    ).rejects.toBeInstanceOf(ExtensionAuthError);
  });

  it("rejects tokens signed with the wrong secret", async () => {
    const token = await signExtensionJwt(
      {
        channel_id: "12345",
        exp: Math.floor(Date.now() / 1000) + 300,
        role: "viewer",
        user_id: "viewer-1",
        opaque_user_id: "Uopaque-user",
        is_unlinked: false,
      },
      "bm90LXRoZS1yaWdodC1zZWNyZXQ="
    );

    await expect(
      verifyExtensionJwt({
        token,
        sharedSecret,
      })
    ).rejects.toBeInstanceOf(ExtensionAuthError);
  });
});

async function signExtensionJwt(
  payload: Record<string, unknown>,
  secretBase64 = sharedSecret
) {
  const header = encodeBase64Url(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    })
  );
  const body = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(secretBase64, "base64"),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput)
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function encodeBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;

  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
