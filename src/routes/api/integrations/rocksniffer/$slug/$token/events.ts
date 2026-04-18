// Route: Accepts RockSniffer addon song-start relays and syncs the current queue item.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { callBackend } from "~/lib/backend";
import {
  ensureRockSnifferRelayToken,
  getChannelBySlug,
  getPlaylistByChannelId,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  findRockSnifferPlaylistMatch,
  parseRockSnifferSongStartedEvent,
  resolveRockSnifferRelayPlan,
} from "~/lib/rocksniffer/integration";
import { json } from "~/lib/utils";

const rockSnifferCorsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function withRockSnifferCors(response: Response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(rockSnifferCorsHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function mutatePlaylist(
  runtimeEnv: AppEnv,
  input: {
    channelId: string;
    actorUserId: string;
    action: "markPlayed" | "setCurrent";
    itemId: string;
  }
) {
  const response = await callBackend(runtimeEnv, "/internal/playlist/mutate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return (await response.json().catch(() => null)) as {
    message?: string | null;
  } | null;
}

export const Route = createFileRoute(
  "/api/integrations/rocksniffer/$slug/$token/events"
)({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: rockSnifferCorsHeaders,
        }),
      POST: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        try {
          const channel = await getChannelBySlug(runtimeEnv, params.slug);

          if (!channel) {
            return withRockSnifferCors(
              json({ message: "Channel not found." }, { status: 404 })
            );
          }

          const expectedToken = await ensureRockSnifferRelayToken(
            runtimeEnv,
            channel.id
          );
          if (expectedToken !== params.token) {
            return withRockSnifferCors(
              json({ message: "Invalid relay token." }, { status: 401 })
            );
          }

          const payload = await request.json().catch(() => null);
          const event = parseRockSnifferSongStartedEvent(payload);

          if (!event) {
            return withRockSnifferCors(
              json(
                { message: "Invalid RockSniffer event payload." },
                { status: 400 }
              )
            );
          }

          const playlistState = await getPlaylistByChannelId(
            runtimeEnv,
            channel.id
          );
          if (!playlistState) {
            return withRockSnifferCors(
              json({ message: "Playlist not found." }, { status: 404 })
            );
          }

          const match = findRockSnifferPlaylistMatch(playlistState.items, {
            title: event.song.title,
            artist: event.song.artist,
          });

          const plan = resolveRockSnifferRelayPlan({
            items: playlistState.items,
            match,
          });

          console.info("RockSniffer relay received", {
            channelId: channel.id,
            channelSlug: channel.slug,
            songId: event.song.id,
            title: event.song.title,
            artist: event.song.artist,
            arrangement: event.song.arrangement,
            tuning: event.song.tuning,
            observedAt: event.observedAt,
            matchStatus: match.status,
            planStatus: plan.status,
          });

          if (plan.status === "no_match") {
            return withRockSnifferCors(
              json(
                {
                  ok: true,
                  status: "ignored_no_match",
                  message: "No queued song matched this RockSniffer event.",
                },
                { status: 202 }
              )
            );
          }

          if (plan.status === "ambiguous") {
            return withRockSnifferCors(
              json(
                {
                  ok: true,
                  status: "ignored_ambiguous",
                  message:
                    "More than one queued song matched this RockSniffer event.",
                  itemIds: plan.matches.map((item) => item.id),
                },
                { status: 202 }
              )
            );
          }

          if (plan.status === "already_current") {
            return withRockSnifferCors(
              json({
                ok: true,
                status: "already_current",
                message: "Matching queue item is already current.",
                itemId: plan.item.id,
              })
            );
          }

          if (plan.status === "mark_played_then_set_current") {
            try {
              await mutatePlaylist(runtimeEnv, {
                channelId: channel.id,
                actorUserId: channel.ownerUserId,
                action: "markPlayed",
                itemId: plan.currentItem.id,
              });
            } catch (error) {
              const message =
                "RockList.Live could not finish the current song, so the queue was left unchanged.";
              console.error("RockSniffer relay could not mark current played", {
                channelSlug: params.slug,
                currentItemId: plan.currentItem.id,
                nextItemId: plan.item.id,
                error: error instanceof Error ? error.message : String(error),
              });
              return withRockSnifferCors(json({ message }, { status: 409 }));
            }

            try {
              const result = await mutatePlaylist(runtimeEnv, {
                channelId: channel.id,
                actorUserId: channel.ownerUserId,
                action: "setCurrent",
                itemId: plan.item.id,
              });

              return withRockSnifferCors(
                json({
                  ok: true,
                  status: "current_advanced_and_updated",
                  message: result?.message
                    ? `Previous current song marked played. ${result.message}`
                    : "Previous current song marked played. Matching song is now playing.",
                  itemId: plan.item.id,
                  previousItemId: plan.currentItem.id,
                })
              );
            } catch (error) {
              const message =
                "RockList.Live finished the previous current song, but could not start the new one automatically.";
              console.error("RockSniffer relay could not set new current", {
                channelSlug: params.slug,
                previousItemId: plan.currentItem.id,
                itemId: plan.item.id,
                error: error instanceof Error ? error.message : String(error),
              });
              return withRockSnifferCors(json({ message }, { status: 409 }));
            }
          }

          const result = await mutatePlaylist(runtimeEnv, {
            channelId: channel.id,
            actorUserId: channel.ownerUserId,
            action: "setCurrent",
            itemId: plan.item.id,
          });

          return withRockSnifferCors(
            json({
              ok: true,
              status: "current_updated",
              message: result?.message ?? "Current song updated.",
              itemId: plan.item.id,
            })
          );
        } catch (error) {
          console.error("RockSniffer relay failed", {
            channelSlug: params.slug,
            error: error instanceof Error ? error.message : String(error),
          });

          return withRockSnifferCors(
            json(
              { message: "RockList.Live could not process this song start." },
              { status: 500 }
            )
          );
        }
      },
    },
  },
});
