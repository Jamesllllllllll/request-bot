import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setHttpStatusMock, startSpanMock } = vi.hoisted(() => ({
  setHttpStatusMock: vi.fn(),
  startSpanMock: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
  setHttpStatus: setHttpStatusMock,
  startSpan: startSpanMock,
}));

import { sendChatReply } from "~/lib/twitch/api";

describe("sendChatReply", () => {
  const fetchMock = vi.fn();
  const span = {
    setAttribute: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    startSpanMock.mockImplementation((_options, callback) => callback(span));
    setHttpStatusMock.mockReset();
    fetchMock.mockReset();
    span.setAttribute.mockClear();
    span.setStatus.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a Sentry span around successful chat replies", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ is_sent: true, message_id: "msg-1" }],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const result = await sendChatReply({
      env: {
        TWITCH_CLIENT_ID: "client-id",
      },
      accessToken: "access-token",
      broadcasterUserId: "broadcaster-1",
      senderUserId: "sender-1",
      message: "hello world",
    });

    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Send Twitch chat reply",
        op: "twitch.chat.reply",
        attributes: expect.objectContaining({
          "messaging.system": "twitch",
          "messaging.destination.name": "chat/messages",
          "request_bot.chat.reply.message_length": 11,
          "request_bot.chat.reply.max_retries": 4,
        }),
      }),
      expect.any(Function)
    );
    expect(setHttpStatusMock).toHaveBeenCalledWith(span, 200);
    expect(span.setAttribute).toHaveBeenCalledWith(
      "request_bot.chat.reply.is_sent",
      true
    );
    expect(span.setStatus).toHaveBeenCalledWith({
      code: 1,
      message: "ok",
    });
    expect(result).toEqual({
      messageId: "msg-1",
    });
  });

  it("marks the span when Twitch accepts but declines to send the reply", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              is_sent: false,
              drop_reason: {
                code: "automod_held",
                message: "held for review",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    await expect(
      sendChatReply({
        env: {
          TWITCH_CLIENT_ID: "client-id",
        },
        accessToken: "access-token",
        broadcasterUserId: "broadcaster-1",
        senderUserId: "sender-1",
        message: "hello world",
      })
    ).rejects.toThrow("automod_held");

    expect(setHttpStatusMock).toHaveBeenCalledWith(span, 200);
    expect(span.setAttribute).toHaveBeenCalledWith(
      "request_bot.chat.reply.is_sent",
      false
    );
    expect(span.setAttribute).toHaveBeenCalledWith(
      "request_bot.chat.reply.drop_code",
      "automod_held"
    );
    expect(span.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: "failed_precondition",
    });
  });
});
