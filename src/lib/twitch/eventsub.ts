import type { AppEnv } from "~/lib/env";

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

export async function verifyEventSubSignature(
  request: Request,
  env: AppEnv,
  bodyText: string
) {
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id");
  const timestamp = request.headers.get("Twitch-Eventsub-Message-Timestamp");
  const signature = request.headers.get("Twitch-Eventsub-Message-Signature");

  if (!messageId || !timestamp || !signature) {
    return false;
  }

  const expected = await sign(
    env.TWITCH_EVENTSUB_SECRET,
    `${messageId}${timestamp}${bodyText}`
  );
  return expected === signature;
}
