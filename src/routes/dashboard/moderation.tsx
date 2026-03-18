// Route: Renders moderation controls and command reference for the active channel.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { pageTitle } from "~/lib/page-title";

const viewerCommands = [
  { command: "!sr song name", description: "Add a request." },
  { command: "!sr song:12345", description: "Request by song ID." },
  { command: "!vip song name", description: "Use a VIP request." },
  { command: "!remove reg", description: "Remove regular request." },
  { command: "!remove vip", description: "Remove VIP request." },
  { command: "!remove all", description: "Remove all requests." },
  { command: "!how", description: "Show request help." },
  { command: "!search", description: "Open song search." },
] as const;

const staffCommands = [
  { command: "!sr song name @username", description: "Add for a viewer." },
  { command: "!vip song name @username", description: "VIP for a viewer." },
  {
    command: "!edit song name @username",
    description: "Edit their request.",
  },
  { command: "!remove reg @username", description: "Remove regular request." },
  { command: "!remove vip @username", description: "Remove VIP request." },
  { command: "!remove all @username", description: "Remove all requests." },
  { command: "!addvip username", description: "Grant one VIP token." },
] as const;

export const Route = createFileRoute("/dashboard/moderation")({
  head: () => ({
    meta: [{ title: pageTitle("Moderation") }],
  }),
  component: DashboardModerationPage,
});

function DashboardModerationPage() {
  const queryClient = useQueryClient();
  const [artistName, setArtistName] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [setlistArtistName, setSetlistArtistName] = useState("");
  const [vipLogin, setVipLogin] = useState("");

  const { data } = useQuery({
    queryKey: ["dashboard-moderation"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/moderation");
      return response.json() as Promise<{
        blocks: Array<{
          twitchUserId: string;
          displayName?: string;
          reason?: string;
        }>;
        blacklistArtists: Array<{ artistName: string }>;
        blacklistSongs: Array<{ songTitle: string }>;
        setlistArtists: Array<{ artistName: string }>;
        vipTokens: Array<{
          login: string;
          displayName?: string;
          availableCount: number;
          grantedCount: number;
          consumedCount: number;
        }>;
      }>;
    },
  });

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch("/api/dashboard/moderation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-moderation"],
      });
    },
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Moderation</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="commands" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Commands</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-3 rounded-2xl border border-(--border) bg-(--panel-soft) p-5">
              <p className="text-sm font-semibold">Viewers</p>
              <div className="grid gap-3">
                {viewerCommands.map((item) => (
                  <div key={item.command} className="grid gap-1">
                    <p className="font-mono text-sm text-(--text)">
                      {item.command}
                    </p>
                    <p className="text-xs text-(--muted)">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-(--border) bg-(--panel-soft) p-5">
              <p className="text-sm font-semibold">Mods and streamers</p>
              <div className="grid gap-3">
                {staffCommands.map((item) => (
                  <div key={item.command} className="grid gap-1">
                    <p className="font-mono text-sm text-(--text)">
                      {item.command}
                    </p>
                    <p className="text-xs text-(--muted)">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blacklisted artists</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-3">
              <input
                value={artistName}
                onChange={(event) => setArtistName(event.target.value)}
                placeholder="Add artist"
                className="flex-1 rounded-2xl border border-(--border) px-4 py-3"
              />
              <Button
                onClick={() => {
                  mutation.mutate({
                    action: "addBlacklistedArtist",
                    artistName,
                  });
                  setArtistName("");
                }}
                disabled={mutation.isPending || !artistName.trim()}
              >
                Add
              </Button>
            </div>
            <div className="grid gap-3">
              {data?.blacklistArtists?.length ? (
                data.blacklistArtists.map((item) => (
                  <div
                    key={item.artistName}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                  >
                    <span>{item.artistName}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutation.mutate({
                          action: "removeBlacklistedArtist",
                          artistName: item.artistName,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-(--muted)">Not found</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blacklisted songs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-3">
              <input
                value={songTitle}
                onChange={(event) => setSongTitle(event.target.value)}
                placeholder="Add song"
                className="flex-1 rounded-2xl border border-(--border) px-4 py-3"
              />
              <Button
                onClick={() => {
                  mutation.mutate({ action: "addBlacklistedSong", songTitle });
                  setSongTitle("");
                }}
                disabled={mutation.isPending || !songTitle.trim()}
              >
                Add
              </Button>
            </div>
            <div className="grid gap-3">
              {data?.blacklistSongs?.length ? (
                data.blacklistSongs.map((item) => (
                  <div
                    key={item.songTitle}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                  >
                    <span>{item.songTitle}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutation.mutate({
                          action: "removeBlacklistedSong",
                          songTitle: item.songTitle,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-(--muted)">Not found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Setlist artists</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-3">
            <input
              value={setlistArtistName}
              onChange={(event) => setSetlistArtistName(event.target.value)}
              placeholder="Add artist"
              className="flex-1 rounded-2xl border border-(--border) px-4 py-3"
            />
            <Button
              onClick={() => {
                mutation.mutate({
                  action: "addSetlistArtist",
                  artistName: setlistArtistName,
                });
                setSetlistArtistName("");
              }}
              disabled={mutation.isPending || !setlistArtistName.trim()}
            >
              Add
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data?.setlistArtists?.length ? (
              data.setlistArtists.map((item) => (
                <div
                  key={item.artistName}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                >
                  <span>{item.artistName}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutation.mutate({
                        action: "removeSetlistArtist",
                        artistName: item.artistName,
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-(--muted)">Not found</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked users</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data?.blocks?.map((block) => (
            <div
              key={block.twitchUserId}
              className="rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4"
            >
              <p className="font-medium">
                {block.displayName ?? block.twitchUserId}
              </p>
              <p className="text-sm text-(--muted)">
                {block.reason ?? "No reason provided"}
              </p>
            </div>
          ))}
          {data?.blocks?.length ? null : (
            <p className="text-sm text-(--muted)">No blocked users.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VIP tokens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-3">
            <input
              value={vipLogin}
              onChange={(event) => setVipLogin(event.target.value)}
              placeholder="Add VIP token to username"
              className="flex-1 rounded-2xl border border-(--border) px-4 py-3"
            />
            <Button
              onClick={() => {
                mutation.mutate({ action: "addVipToken", login: vipLogin });
                setVipLogin("");
              }}
              disabled={mutation.isPending || !vipLogin.trim()}
            >
              Grant token
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data?.vipTokens?.length ? (
              data.vipTokens.map((token) => (
                <div
                  key={token.login}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {token.displayName ?? token.login}
                    </p>
                    <p className="text-sm text-(--muted)">
                      Available: {token.availableCount} · Granted:{" "}
                      {token.grantedCount} · Consumed: {token.consumedCount}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutation.mutate({
                        action: "removeVipToken",
                        login: token.login,
                      })
                    }
                  >
                    Remove one
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-(--muted)">No VIP tokens yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
