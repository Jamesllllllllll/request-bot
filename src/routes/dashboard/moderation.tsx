// Route: Renders moderation controls and command reference for the active channel.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { pageTitle } from "~/lib/page-title";
import { clampVipTokenCount, formatVipTokenCount } from "~/lib/vip-tokens";

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

type ArtistMatch = {
  artistId: number;
  artistName: string;
  trackCount: number;
};

type CharterMatch = {
  charterId: number;
  charterName: string;
  trackCount: number;
};

type SongMatch = {
  songId: number;
  songTitle: string;
  artistId?: number | null;
  artistName?: string | null;
};

type TwitchUserMatch = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
  isCurrentChatter?: boolean;
};

type TwitchUserSearchResponse = {
  users: TwitchUserMatch[];
  needsChatterScopeReconnect?: boolean;
  preferredSource?: "chatters" | "global";
};

type ModerationData = {
  settings: {
    blacklistEnabled: boolean;
  };
  blocks: Array<{
    twitchUserId: string;
    displayName?: string;
    reason?: string;
  }>;
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistCharters: Array<{ charterId: number; charterName: string }>;
  blacklistSongs: Array<{
    songId: number;
    songTitle: string;
    artistId?: number | null;
    artistName?: string | null;
  }>;
  setlistArtists: Array<{ artistId: number; artistName: string }>;
  vipTokens: Array<{
    login: string;
    displayName?: string;
    availableCount: number;
  }>;
};

export const Route = createFileRoute("/dashboard/moderation")({
  head: () => ({
    meta: [{ title: pageTitle("Moderation") }],
  }),
  component: DashboardModerationPage,
});

function DashboardModerationPage() {
  const queryClient = useQueryClient();
  const [artistQuery, setArtistQuery] = useState("");
  const [debouncedArtistQuery, setDebouncedArtistQuery] = useState("");
  const [charterQuery, setCharterQuery] = useState("");
  const [debouncedCharterQuery, setDebouncedCharterQuery] = useState("");
  const [songQuery, setSongQuery] = useState("");
  const [debouncedSongQuery, setDebouncedSongQuery] = useState("");
  const [setlistArtistQuery, setSetlistArtistQuery] = useState("");
  const [debouncedSetlistArtistQuery, setDebouncedSetlistArtistQuery] =
    useState("");
  const [vipLogin, setVipLogin] = useState("");
  const [debouncedVipLogin, setDebouncedVipLogin] = useState("");
  const [selectedVipUser, setSelectedVipUser] =
    useState<TwitchUserMatch | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedArtistQuery(artistQuery.trim());
      setDebouncedCharterQuery(charterQuery.trim());
      setDebouncedSongQuery(songQuery.trim());
      setDebouncedSetlistArtistQuery(setlistArtistQuery.trim());
      setDebouncedVipLogin(vipLogin.trim());
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [artistQuery, charterQuery, setlistArtistQuery, songQuery, vipLogin]);

  const { data } = useQuery({
    queryKey: ["dashboard-moderation"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/moderation");
      return response.json() as Promise<ModerationData>;
    },
  });

  const artistSearchQuery = useQuery({
    queryKey: ["dashboard-moderation-artist-search", debouncedArtistQuery],
    queryFn: async () => {
      const response = await fetch(
        `/api/dashboard/moderation/search?type=artist&query=${encodeURIComponent(
          debouncedArtistQuery
        )}`
      );
      return response.json() as Promise<{ artists: ArtistMatch[] }>;
    },
    enabled: debouncedArtistQuery.length >= 2,
  });

  const songSearchQuery = useQuery({
    queryKey: ["dashboard-moderation-song-search", debouncedSongQuery],
    queryFn: async () => {
      const response = await fetch(
        `/api/dashboard/moderation/search?type=song&query=${encodeURIComponent(
          debouncedSongQuery
        )}`
      );
      return response.json() as Promise<{ songs: SongMatch[] }>;
    },
    enabled: debouncedSongQuery.length >= 2,
  });

  const charterSearchQuery = useQuery({
    queryKey: ["dashboard-moderation-charter-search", debouncedCharterQuery],
    queryFn: async () => {
      const response = await fetch(
        `/api/dashboard/moderation/search?type=charter&query=${encodeURIComponent(
          debouncedCharterQuery
        )}`
      );
      return response.json() as Promise<{ charters: CharterMatch[] }>;
    },
    enabled: debouncedCharterQuery.length >= 2,
  });

  const setlistArtistSearchQuery = useQuery({
    queryKey: [
      "dashboard-moderation-setlist-artist-search",
      debouncedSetlistArtistQuery,
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/dashboard/moderation/search?type=artist&query=${encodeURIComponent(
          debouncedSetlistArtistQuery
        )}`
      );
      return response.json() as Promise<{ artists: ArtistMatch[] }>;
    },
    enabled: debouncedSetlistArtistQuery.length >= 2,
  });

  const vipLookupQuery = useQuery({
    queryKey: ["dashboard-moderation-vip-user-search", debouncedVipLogin],
    queryFn: async () => {
      const response = await fetch(
        `/api/dashboard/moderation/search?type=twitch-user&query=${encodeURIComponent(
          debouncedVipLogin
        )}`
      );
      return response.json() as Promise<TwitchUserSearchResponse>;
    },
    enabled: debouncedVipLogin.replace(/^@+/, "").length >= 4,
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

  async function saveVipTokenCount(input: { login: string; count: number }) {
    const response = await fetch("/api/dashboard/moderation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "setVipTokenCount",
        login: input.login,
        count: input.count,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    await queryClient.invalidateQueries({
      queryKey: ["dashboard-moderation"],
    });
  }

  const blacklistedArtistIds = new Set(
    (data?.blacklistArtists ?? []).map((item) => item.artistId)
  );
  const blacklistedCharterIds = new Set(
    (data?.blacklistCharters ?? []).map((item) => item.charterId)
  );
  const blacklistedSongIds = new Set(
    (data?.blacklistSongs ?? []).map((item) => item.songId)
  );
  const visibleArtistMatches = (artistSearchQuery.data?.artists ?? []).filter(
    (artist) => !blacklistedArtistIds.has(artist.artistId)
  );
  const visibleSongMatches = (songSearchQuery.data?.songs ?? []).filter(
    (song) => !blacklistedSongIds.has(song.songId)
  );
  const visibleCharterMatches = (
    charterSearchQuery.data?.charters ?? []
  ).filter((charter) => !blacklistedCharterIds.has(charter.charterId));
  const setlistArtistIds = new Set(
    (data?.setlistArtists ?? []).map((item) => item.artistId)
  );
  const visibleSetlistArtistMatches = (
    setlistArtistSearchQuery.data?.artists ?? []
  ).filter((artist) => !setlistArtistIds.has(artist.artistId));
  const blacklistEnabled = data?.settings.blacklistEnabled ?? false;
  const vipLookupTooShort =
    vipLogin.trim().replace(/^@+/, "").length > 0 &&
    vipLogin.trim().replace(/^@+/, "").length < 4;
  const vipMatches = vipLookupQuery.data?.users ?? [];
  const normalizedVipLogin = vipLogin.trim().replace(/^@+/, "").toLowerCase();
  const hasSelectedVipUser =
    !!selectedVipUser && selectedVipUser.login === normalizedVipLogin;
  const needsChatterScopeReconnect =
    !!vipLookupQuery.data?.needsChatterScopeReconnect;
  const vipPreferredSource = vipLookupQuery.data?.preferredSource ?? "global";

  return (
    <div className="dashboard-moderation grid gap-6">
      <DashboardPageHeader
        title="Moderation"
        description="Manage command help, blacklist entries, setlist artists, blocked users, and VIP tokens."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          id="commands"
          className="dashboard-moderation__section lg:col-span-2"
        >
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

        <Card className="dashboard-moderation__section">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Blacklisted artists</CardTitle>
              {!blacklistEnabled ? (
                <Badge variant="outline">Disabled</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent
            className={`grid gap-4 ${!blacklistEnabled ? "opacity-60" : ""}`}
          >
            <Input
              value={artistQuery}
              onChange={(event) => setArtistQuery(event.target.value)}
              placeholder="Search artists by name"
              disabled={!blacklistEnabled}
            />
            {blacklistEnabled &&
            debouncedArtistQuery.length > 0 &&
            debouncedArtistQuery.length < 2 ? (
              <p className="text-sm text-(--muted)">
                Type at least 2 characters to search.
              </p>
            ) : null}
            {blacklistEnabled && debouncedArtistQuery.length >= 2 ? (
              <div className="grid gap-3">
                {visibleArtistMatches.map((artist) => {
                  return (
                    <div
                      key={artist.artistId}
                      className="dashboard-moderation__entry flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-(--text)">
                          {artist.artistName}
                        </p>
                        <p className="text-xs text-(--muted)">
                          Artist ID {artist.artistId} · {artist.trackCount}{" "}
                          tracks
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          mutation.mutate({
                            action: "addBlacklistedArtist",
                            artistId: artist.artistId,
                            artistName: artist.artistName,
                          })
                        }
                        disabled={mutation.isPending || !blacklistEnabled}
                      >
                        Add
                      </Button>
                    </div>
                  );
                })}
                {artistSearchQuery.data && visibleArtistMatches.length === 0 ? (
                  <p className="text-sm text-(--muted)">
                    {artistSearchQuery.data.artists.length === 0
                      ? "No matching artists."
                      : "All matching artists are already blacklisted."}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-(--border) bg-(--panel-soft)">
              {data?.blacklistArtists?.length ? (
                <div className="divide-y divide-(--border)">
                  {data.blacklistArtists.map((item) => (
                    <div
                      key={item.artistId}
                      className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-(--text)">
                          {item.artistName}
                        </p>
                        <p className="text-xs text-(--muted)">
                          Artist ID {item.artistId}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-sm text-(--brand-deep) underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline"
                        onClick={() =>
                          mutation.mutate({
                            action: "removeBlacklistedArtist",
                            artistId: item.artistId,
                          })
                        }
                        disabled={!blacklistEnabled || mutation.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-(--muted)">
                  No blacklisted artists.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard-moderation__section">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Blacklisted charters</CardTitle>
              {!blacklistEnabled ? (
                <Badge variant="outline">Disabled</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent
            className={`grid gap-4 ${!blacklistEnabled ? "opacity-60" : ""}`}
          >
            <Input
              value={charterQuery}
              onChange={(event) => setCharterQuery(event.target.value)}
              placeholder="Search charters by name"
              disabled={!blacklistEnabled}
            />
            {blacklistEnabled &&
            debouncedCharterQuery.length > 0 &&
            debouncedCharterQuery.length < 2 ? (
              <p className="text-sm text-(--muted)">
                Type at least 2 characters to search.
              </p>
            ) : null}
            {blacklistEnabled && debouncedCharterQuery.length >= 2 ? (
              <div className="grid gap-3">
                {visibleCharterMatches.map((charter) => (
                  <div
                    key={charter.charterId}
                    className="dashboard-moderation__entry flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-(--text)">
                        {charter.charterName}
                      </p>
                      <p className="text-xs text-(--muted)">
                        Charter ID {charter.charterId} · {charter.trackCount}{" "}
                        tracks
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        mutation.mutate({
                          action: "addBlacklistedCharter",
                          charterId: charter.charterId,
                          charterName: charter.charterName,
                        })
                      }
                      disabled={mutation.isPending || !blacklistEnabled}
                    >
                      Add
                    </Button>
                  </div>
                ))}
                {charterSearchQuery.data &&
                visibleCharterMatches.length === 0 ? (
                  <p className="text-sm text-(--muted)">
                    {charterSearchQuery.data.charters.length === 0
                      ? "No matching charters."
                      : "All matching charters are already blacklisted."}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-(--border) bg-(--panel-soft)">
              {data?.blacklistCharters?.length ? (
                <div className="divide-y divide-(--border)">
                  {data.blacklistCharters.map((item) => (
                    <div
                      key={item.charterId}
                      className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-(--text)">
                          {item.charterName}
                        </p>
                        <p className="text-xs text-(--muted)">
                          Charter ID {item.charterId}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-sm text-(--brand-deep) underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline"
                        onClick={() =>
                          mutation.mutate({
                            action: "removeBlacklistedCharter",
                            charterId: item.charterId,
                          })
                        }
                        disabled={!blacklistEnabled || mutation.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-(--muted)">
                  No blacklisted charters.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard-moderation__section">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Blacklisted songs</CardTitle>
              {!blacklistEnabled ? (
                <Badge variant="outline">Disabled</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent
            className={`grid gap-4 ${!blacklistEnabled ? "opacity-60" : ""}`}
          >
            <Input
              value={songQuery}
              onChange={(event) => setSongQuery(event.target.value)}
              placeholder="Search songs by title"
              disabled={!blacklistEnabled}
            />
            {blacklistEnabled &&
            debouncedSongQuery.length > 0 &&
            debouncedSongQuery.length < 2 ? (
              <p className="text-sm text-(--muted)">
                Type at least 2 characters to search.
              </p>
            ) : null}
            {blacklistEnabled && debouncedSongQuery.length >= 2 ? (
              <div className="grid gap-3">
                {visibleSongMatches.map((song) => {
                  return (
                    <div
                      key={song.songId}
                      className="dashboard-moderation__entry flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-(--text)">
                          {song.songTitle}
                          {song.artistName ? ` - ${song.artistName}` : ""}
                        </p>
                        <p className="text-xs text-(--muted)">
                          Song ID {song.songId}
                          {song.artistId ? ` · Artist ID ${song.artistId}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          mutation.mutate({
                            action: "addBlacklistedSong",
                            songId: song.songId,
                            songTitle: song.songTitle,
                            artistId: song.artistId ?? null,
                            artistName: song.artistName ?? undefined,
                          })
                        }
                        disabled={mutation.isPending || !blacklistEnabled}
                      >
                        Add
                      </Button>
                    </div>
                  );
                })}
                {songSearchQuery.data && visibleSongMatches.length === 0 ? (
                  <p className="text-sm text-(--muted)">
                    {songSearchQuery.data.songs.length === 0
                      ? "No matching songs."
                      : "All matching songs are already blacklisted."}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-(--border) bg-(--panel-soft)">
              {data?.blacklistSongs?.length ? (
                <div className="divide-y divide-(--border)">
                  {data.blacklistSongs.map((item) => (
                    <div
                      key={item.songId}
                      className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-(--text)">
                          {item.songTitle}
                          {item.artistName ? ` - ${item.artistName}` : ""}
                        </p>
                        <p className="text-xs text-(--muted)">
                          Song ID {item.songId}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-sm text-(--brand-deep) underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline"
                        onClick={() =>
                          mutation.mutate({
                            action: "removeBlacklistedSong",
                            songId: item.songId,
                          })
                        }
                        disabled={!blacklistEnabled || mutation.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-(--muted)">
                  No blacklisted songs.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="dashboard-moderation__section">
        <CardHeader>
          <CardTitle>Setlist artists</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input
            value={setlistArtistQuery}
            onChange={(event) => setSetlistArtistQuery(event.target.value)}
            placeholder="Search artists by name"
          />
          {debouncedSetlistArtistQuery.length > 0 &&
          debouncedSetlistArtistQuery.length < 2 ? (
            <p className="text-sm text-(--muted)">
              Type at least 2 characters to search.
            </p>
          ) : null}
          {debouncedSetlistArtistQuery.length >= 2 ? (
            <div className="grid gap-3">
              {visibleSetlistArtistMatches.map((artist) => (
                <div
                  key={artist.artistId}
                  className="dashboard-moderation__entry flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-(--text)">
                      {artist.artistName}
                    </p>
                    <p className="text-xs text-(--muted)">
                      Artist ID {artist.artistId} · {artist.trackCount} tracks
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      mutation.mutate({
                        action: "addSetlistArtist",
                        artistId: artist.artistId,
                        artistName: artist.artistName,
                      })
                    }
                    disabled={mutation.isPending}
                  >
                    Add
                  </Button>
                </div>
              ))}
              {setlistArtistSearchQuery.data &&
              visibleSetlistArtistMatches.length === 0 ? (
                <p className="text-sm text-(--muted)">
                  {setlistArtistSearchQuery.data.artists.length === 0
                    ? "No matching artists."
                    : "All matching artists are already on the setlist."}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {data?.setlistArtists?.length ? (
              data.setlistArtists.map((item) => (
                <div
                  key={item.artistName}
                  className="dashboard-moderation__entry flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                >
                  <span>{item.artistName}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutation.mutate({
                        action: "removeSetlistArtist",
                        artistId: item.artistId,
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

      <Card className="dashboard-moderation__section">
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

      <Card className="dashboard-moderation__section">
        <CardHeader>
          <CardTitle>VIP tokens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="dashboard-moderation__form-row flex gap-3">
            <Input
              value={vipLogin}
              onChange={(event) => {
                setVipLogin(event.target.value);
                setSelectedVipUser(null);
              }}
              placeholder="Add VIP token to username"
            />
            <Button
              onClick={() => {
                if (!selectedVipUser) {
                  return;
                }

                mutation.mutate({
                  action: "addVipToken",
                  login: selectedVipUser.login,
                  displayName: selectedVipUser.displayName,
                  twitchUserId: selectedVipUser.id,
                });
                setVipLogin("");
                setSelectedVipUser(null);
              }}
              disabled={mutation.isPending || !hasSelectedVipUser}
            >
              Grant token
            </Button>
          </div>
          {vipLookupTooShort ? (
            <p className="text-sm text-(--muted)">
              Type at least 4 characters to search Twitch usernames.
            </p>
          ) : null}
          {needsChatterScopeReconnect ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm text-amber-100">
                Reconnect Twitch to prioritize viewers currently in chat.
              </p>
              <Button asChild size="sm" variant="outline">
                <a href="/auth/twitch/start?redirectTo=%2Fdashboard%2Fmoderation">
                  Reconnect Twitch
                </a>
              </Button>
            </div>
          ) : null}
          {!vipLookupTooShort &&
          debouncedVipLogin.replace(/^@+/, "").length >= 4 ? (
            <div className="rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3">
              {vipLookupQuery.isFetching ? (
                <p className="text-sm text-(--muted)">
                  Searching Twitch usernames…
                </p>
              ) : vipMatches.length ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                      {vipPreferredSource === "chatters"
                        ? "Current chatters first"
                        : "Twitch matches"}
                    </p>
                    <Badge variant="outline">
                      {vipMatches.length} result
                      {vipMatches.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  {vipMatches.map((user) => {
                    const isSelected = selectedVipUser?.id === user.id;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-2 text-left transition hover:border-(--brand) disabled:cursor-default ${
                          user.isCurrentChatter
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-(--border) bg-background"
                        }`}
                        onClick={() => {
                          setVipLogin(user.login);
                          setSelectedVipUser(user);
                        }}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-(--text)">
                            {user.displayName}
                          </p>
                          <p className="truncate text-sm text-(--muted)">
                            @{user.login} · Twitch ID {user.id}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.isCurrentChatter ? (
                            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
                              In chat
                            </Badge>
                          ) : null}
                          {isSelected ? (
                            <Badge variant="outline">Selected</Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-(--muted)">
                  No matching Twitch usernames.
                </p>
              )}
            </div>
          ) : null}
          <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--panel-soft)">
            {data?.vipTokens?.length ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-(--border) bg-(--panel)">
                    <th className="px-4 py-3 text-left font-semibold text-(--muted)">
                      Username
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-(--muted)">
                      Tokens
                    </th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.vipTokens.map((token) => (
                    <VipTokenRow
                      key={token.login}
                      token={token}
                      onSave={saveVipTokenCount}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-(--muted)">
                No VIP tokens yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type VipTokenRowProps = {
  token: ModerationData["vipTokens"][number];
  onSave(input: { login: string; count: number }): Promise<void>;
};

function VipTokenRow(props: VipTokenRowProps) {
  const [draftCount, setDraftCount] = useState(
    formatVipTokenCount(props.token.availableCount)
  );
  const [saveState, setSaveState] = useState<
    "idle" | "queued" | "saving" | "saved" | "error"
  >("idle");
  const controlsLocked = saveState === "saving";

  useEffect(() => {
    if (saveState === "queued" || saveState === "saving") {
      return;
    }

    setDraftCount(formatVipTokenCount(props.token.availableCount));
  }, [props.token.availableCount, saveState]);

  useEffect(() => {
    const parsed = Number.parseFloat(draftCount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const normalizedCount = clampVipTokenCount(parsed);
    if (normalizedCount === props.token.availableCount) {
      setSaveState((current) =>
        current === "queued" || current === "saving" ? current : "idle"
      );
      return;
    }

    setSaveState("queued");
    const timeout = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        await props.onSave({
          login: props.token.login,
          count: normalizedCount,
        });
        setDraftCount(formatVipTokenCount(normalizedCount));
        setSaveState("saved");
        window.setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current));
        }, 1200);
      } catch {
        setSaveState("error");
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [draftCount, props.onSave, props.token.availableCount, props.token.login]);

  return (
    <tr className="border-b border-(--border) last:border-b-0">
      <td className="px-4 py-3 font-medium text-(--text)">
        @{props.token.login}
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-[200px] items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-(--border) p-2 text-(--muted) transition hover:border-(--brand) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--border) disabled:hover:text-(--muted)"
            onClick={() =>
              setDraftCount((current) =>
                formatVipTokenCount(
                  Math.max(
                    0,
                    clampVipTokenCount(Number.parseFloat(current || "0")) - 1
                  )
                )
              )
            }
            disabled={controlsLocked}
          >
            <Minus className="h-4 w-4" />
          </button>
          <Input
            value={draftCount}
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{0,2})?"
            className="h-10 rounded-xl bg-background px-3 py-2 text-center"
            disabled={controlsLocked}
            onChange={(event) => {
              const rawValue = event.target.value.replace(/[^0-9.]/g, "");
              const [wholePart, ...decimalParts] = rawValue.split(".");
              const decimalPart = decimalParts.join("").slice(0, 2);
              const next =
                decimalParts.length > 0
                  ? `${wholePart}.${decimalPart}`
                  : wholePart;
              setDraftCount(next);
            }}
            onBlur={() => {
              if (draftCount.trim() === "") {
                setDraftCount(formatVipTokenCount(props.token.availableCount));
                setSaveState("idle");
                return;
              }

              const parsed = Number.parseFloat(draftCount);
              if (!Number.isFinite(parsed)) {
                setDraftCount(formatVipTokenCount(props.token.availableCount));
                setSaveState("idle");
                return;
              }

              setDraftCount(formatVipTokenCount(parsed));
            }}
          />
          <button
            type="button"
            className="rounded-full border border-(--border) p-2 text-(--muted) transition hover:border-(--brand) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--border) disabled:hover:text-(--muted)"
            onClick={() =>
              setDraftCount((current) =>
                formatVipTokenCount(
                  clampVipTokenCount(Number.parseFloat(current || "0")) + 1
                )
              )
            }
            disabled={controlsLocked}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {saveState === "saved" ? (
          <span className="inline-flex items-center text-emerald-300">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </td>
    </tr>
  );
}
