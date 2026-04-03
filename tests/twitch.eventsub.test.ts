import { describe, expect, it } from "vitest";
import {
  eventSubMaxAgeMs,
  verifyEventSubSignature,
} from "~/lib/twitch/eventsub";

async function sign(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return `sha256=${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("verifyEventSubSignature", () => {
  it("accepts a valid signature", async () => {
    const body = JSON.stringify({ challenge: "abc" });
    const messageId = "msg-1";
    const timestamp = new Date("2026-03-14T12:00:00Z").toISOString();
    const signature = await sign(
      "test-secret",
      `${messageId}${timestamp}${body}`
    );

    const request = new Request("https://example.com/api/eventsub", {
      method: "POST",
      headers: {
        "Twitch-Eventsub-Message-Id": messageId,
        "Twitch-Eventsub-Message-Timestamp": timestamp,
        "Twitch-Eventsub-Message-Signature": signature,
      },
      body,
    });

    await expect(
      verifyEventSubSignature(
        request,
        {
          TWITCH_EVENTSUB_SECRET: "test-secret",
        } as never,
        body,
        {
          now: Date.parse("2026-03-14T12:05:00Z"),
        }
      )
    ).resolves.toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const body = JSON.stringify({ challenge: "abc" });
    const request = new Request("https://example.com/api/eventsub", {
      method: "POST",
      headers: {
        "Twitch-Eventsub-Message-Id": "msg-1",
        "Twitch-Eventsub-Message-Timestamp": new Date(
          "2026-03-14T12:00:00Z"
        ).toISOString(),
        "Twitch-Eventsub-Message-Signature": "sha256=deadbeef",
      },
      body,
    });

    await expect(
      verifyEventSubSignature(
        request,
        {
          TWITCH_EVENTSUB_SECRET: "test-secret",
        } as never,
        body,
        {
          now: Date.parse("2026-03-14T12:05:00Z"),
        }
      )
    ).resolves.toBe(false);
  });

  it("rejects stale timestamps even with a valid signature", async () => {
    const body = JSON.stringify({ challenge: "abc" });
    const messageId = "msg-2";
    const timestamp = new Date("2026-03-14T12:00:00Z").toISOString();
    const signature = await sign(
      "test-secret",
      `${messageId}${timestamp}${body}`
    );
    const request = new Request("https://example.com/api/eventsub", {
      method: "POST",
      headers: {
        "Twitch-Eventsub-Message-Id": messageId,
        "Twitch-Eventsub-Message-Timestamp": timestamp,
        "Twitch-Eventsub-Message-Signature": signature,
      },
      body,
    });

    await expect(
      verifyEventSubSignature(
        request,
        {
          TWITCH_EVENTSUB_SECRET: "test-secret",
        } as never,
        body,
        {
          now: Date.parse(timestamp) + eventSubMaxAgeMs + 1,
        }
      )
    ).resolves.toBe(false);
  });
});
