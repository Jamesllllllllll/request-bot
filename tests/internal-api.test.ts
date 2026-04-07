import { describe, expect, it, vi } from "vitest";
import { callBackend, notifyPlaylistStream } from "~/lib/backend";
import type { AppEnv } from "~/lib/env";
import {
  hasValidInternalApiSecret,
  internalApiSecretHeaderName,
} from "~/lib/internal-api";

describe("internal backend authentication", () => {
  it("attaches the shared secret to backend calls", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    );
    const env = {
      BACKEND_SERVICE: {
        fetch,
      },
      INTERNAL_API_SECRET: "shared-secret",
    } as unknown as AppEnv;

    await callBackend(env, "/internal/playlist/mutate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ ok: true }),
    });

    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).headers.get(internalApiSecretHeaderName)).toBe(
      "shared-secret"
    );
    expect((request as Request).headers.get("content-type")).toBe(
      "application/json"
    );
  });

  it("sends playlist stream notify payloads through the internal backend", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    );
    const env = {
      BACKEND_SERVICE: {
        fetch,
      },
      INTERNAL_API_SECRET: "shared-secret",
    } as unknown as AppEnv;

    await notifyPlaylistStream(env, {
      channelId: "channel-1",
      reason: "settings",
    });

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("http://backend/internal/playlist/notify");
    expect(request.method).toBe("POST");
    expect(request.headers.get(internalApiSecretHeaderName)).toBe(
      "shared-secret"
    );
    await expect(request.json()).resolves.toEqual({
      channelId: "channel-1",
      reason: "settings",
    });
  });

  it("does not throw if playlist stream notification delivery fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 }));
    const env = {
      BACKEND_SERVICE: {
        fetch,
      },
      INTERNAL_API_SECRET: "shared-secret",
    } as unknown as AppEnv;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyPlaylistStream(env, {
        channelId: "channel-1",
        reason: "playlist",
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to notify playlist stream listeners",
      expect.objectContaining({
        channelId: "channel-1",
        reason: "playlist",
      })
    );

    errorSpy.mockRestore();
  });

  it("validates the backend request secret", () => {
    const request = new Request(
      "https://example.com/internal/playlist/stream",
      {
        headers: {
          [internalApiSecretHeaderName]: "shared-secret",
        },
      }
    );

    expect(
      hasValidInternalApiSecret(request, {
        INTERNAL_API_SECRET: "shared-secret",
      } as never)
    ).toBe(true);
    expect(
      hasValidInternalApiSecret(request, {
        INTERNAL_API_SECRET: "other-secret",
      } as never)
    ).toBe(false);
  });
});
