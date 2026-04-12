import { afterEach, describe, expect, it, vi } from "vitest";
import { sendExtensionPlaylistPubSubMessage } from "~/lib/twitch/extension-pubsub";

function decodeBase64UrlJson(segment: string) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

describe("Twitch extension PubSub sender", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a broadcast invalidation with an external JWT", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      sendExtensionPlaylistPubSubMessage(
        {
          TWITCH_CLIENT_ID: "client-id",
          TWITCH_EXTENSION_SECRET: "c2VjcmV0",
        },
        {
          broadcasterId: "141981764",
          reason: "playlist",
        }
      )
    ).resolves.toBe(true);

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect(requestUrl).toBe("https://api.twitch.tv/helix/extensions/pubsub");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Bearer /),
      "Client-Id": "client-id",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(requestInit?.body)) as {
      broadcaster_id: string;
      target: string[];
      message: string;
    };
    expect(body.broadcaster_id).toBe("141981764");
    expect(body.target).toEqual(["broadcast"]);
    expect(JSON.parse(body.message)).toMatchObject({
      type: "playlist.invalidate",
      reason: "playlist",
      emittedAt: expect.any(Number),
    });

    const authorization = String(
      (requestInit?.headers as Record<string, string>).Authorization
    ).replace(/^Bearer /, "");
    const [headerSegment, payloadSegment] = authorization.split(".");

    expect(decodeBase64UrlJson(headerSegment)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(decodeBase64UrlJson(payloadSegment)).toMatchObject({
      role: "external",
      user_id: "141981764",
      channel_id: "141981764",
      pubsub_perms: {
        send: ["broadcast"],
      },
    });
  });

  it("skips the request when the extension secret is unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      sendExtensionPlaylistPubSubMessage(
        {
          TWITCH_CLIENT_ID: "client-id",
          TWITCH_EXTENSION_SECRET: "",
        },
        {
          broadcasterId: "141981764",
          reason: "settings",
        }
      )
    ).resolves.toBe(false);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
