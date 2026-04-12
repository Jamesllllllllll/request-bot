import type { AppEnv } from "./env";
import { withInternalApiSecret } from "./internal-api";
import type { PlaylistStreamNotifyReason } from "./playlist/realtime";
import { getErrorMessage } from "./utils";

export type { PlaylistStreamNotifyReason } from "./playlist/realtime";

export async function callBackend(
  env: AppEnv,
  pathname: string,
  init?: RequestInit
) {
  const request = new Request(
    `http://backend${pathname}`,
    withInternalApiSecret(env, init)
  );
  const response = await env.BACKEND_SERVICE.fetch(request);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = `Backend request failed: ${response.status}`;

    if (body) {
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        message = `${message} ${body}`;
      }
    }

    throw new Error(
      getErrorMessage(message, `Backend request failed: ${response.status}`)
    );
  }

  return response;
}

export async function notifyPlaylistStream(
  env: AppEnv,
  input: {
    channelId: string;
    reason: PlaylistStreamNotifyReason;
  }
) {
  try {
    await callBackend(env, "/internal/playlist/notify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.error("Failed to notify playlist stream listeners", {
      channelId: input.channelId,
      reason: input.reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
