import type { BackendEnv } from "~/lib/env";
import {
  createExtensionPlaylistPubSubMessage,
  type PlaylistStreamNotifyReason,
} from "~/lib/playlist/realtime";

const twitchBaseUrl = "https://api.twitch.tv/helix";

function toBase64Url(input: string | Uint8Array) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Secret(secret: string) {
  const normalized = secret.trim();

  if (!normalized) {
    throw new Error("The Twitch extension secret is empty.");
  }

  const decoded = atob(normalized);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

async function createExtensionExternalJwt(input: {
  extensionSecret: string;
  broadcasterId: string;
}) {
  const header = toBase64Url(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    })
  );
  const payload = toBase64Url(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 60,
      user_id: input.broadcasterId,
      role: "external",
      channel_id: input.broadcasterId,
      pubsub_perms: {
        send: ["broadcast"],
      },
    })
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64Secret(input.extensionSecret),
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
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function sendExtensionPlaylistPubSubMessage(
  env: Pick<BackendEnv, "TWITCH_CLIENT_ID" | "TWITCH_EXTENSION_SECRET">,
  input: {
    broadcasterId: string;
    reason: PlaylistStreamNotifyReason;
  }
) {
  if (!env.TWITCH_EXTENSION_SECRET?.trim()) {
    return false;
  }

  const authorization = await createExtensionExternalJwt({
    extensionSecret: env.TWITCH_EXTENSION_SECRET,
    broadcasterId: input.broadcasterId,
  });
  const message = JSON.stringify(
    createExtensionPlaylistPubSubMessage(input.reason)
  );
  const response = await fetch(`${twitchBaseUrl}/extensions/pubsub`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authorization}`,
      "Client-Id": env.TWITCH_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: input.broadcasterId,
      target: ["broadcast"],
      message,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to send Twitch extension PubSub message: ${response.status}${body ? ` ${body}` : ""}`
    );
  }

  return true;
}
