// Route: Reads and mutates playlist state for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  getChannelSettingsByChannelId,
  getDashboardChannelAccess,
  getDashboardState,
  getPlaylistByChannelId,
} from "~/lib/db/repositories";
import {
  assertDatabaseSchemaCurrent,
  DatabaseSchemaOutOfDateError,
} from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { getArraySetting } from "~/lib/request-policy";
import { json } from "~/lib/utils";
import { playlistMutationSchema } from "~/lib/validation";

async function requireDashboardState(
  request: Request,
  runtimeEnv: AppEnv,
  requestedSlug?: string | null
) {
  await assertDatabaseSchemaCurrent(runtimeEnv);
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  const access = await getDashboardChannelAccess(
    runtimeEnv,
    userId,
    requestedSlug
  );
  if (!access) {
    return null;
  }

  if (access.accessRole === "owner") {
    const state = await getDashboardState(runtimeEnv, userId);
    if (!state) {
      return null;
    }

    return {
      ...state,
      accessRole: access.accessRole,
      actorUserId: access.actorUserId,
    };
  }

  const playlistState = await getPlaylistByChannelId(
    runtimeEnv,
    access.channel.id
  );
  const settings = await getChannelSettingsByChannelId(
    runtimeEnv,
    access.channel.id
  );
  if (!playlistState) {
    return null;
  }

  return {
    channel: access.channel,
    settings,
    playlist: playlistState.playlist,
    items: playlistState.items,
    playedSongs: [],
    accessRole: access.accessRole,
    actorUserId: access.actorUserId,
  };
}

export const Route = createFileRoute("/api/dashboard/playlist")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        try {
          const requestedSlug =
            new URL(request.url).searchParams.get("channel") ?? null;
          const state = await requireDashboardState(
            request,
            runtimeEnv,
            requestedSlug
          );
          if (!state) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }

          return json({
            channel: state.channel,
            playlist: state.playlist,
            items: state.items,
            playedSongs: state.playedSongs,
            accessRole: state.accessRole,
            requiredPaths: state.settings
              ? getArraySetting(state.settings.requiredPathsJson)
              : [],
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load the playlist.";
          const status =
            error instanceof DatabaseSchemaOutOfDateError ? 503 : 500;

          return json({ error: message }, { status });
        }
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const requestedSlug =
          new URL(request.url).searchParams.get("channel") ?? null;
        const state = await requireDashboardState(
          request,
          runtimeEnv,
          requestedSlug
        );
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const body = playlistMutationSchema.parse(await request.json());
          const response = await callBackend(
            runtimeEnv,
            "/internal/playlist/mutate",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                channelId: state.channel.id,
                actorUserId: state.actorUserId,
                ...body,
              }),
            }
          );

          return new Response(await response.text(), {
            status: response.status,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Playlist update failed.";

          if (
            error instanceof DatabaseSchemaOutOfDateError ||
            message.includes("no column named request_kind")
          ) {
            return json(
              {
                error: message,
              },
              { status: 503 }
            );
          }

          return json(
            {
              error: message,
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
