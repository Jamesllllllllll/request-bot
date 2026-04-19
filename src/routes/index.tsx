// Route: Renders the public landing page with sign-in and search entry points.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ExternalLink,
  Flame,
  ListMusic,
  Play,
  Radio,
  Search,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import type {
  HomeCommunityArtistTrend,
  HomeLiveChannel,
  HomeLiveChannelsResponse,
} from "~/lib/home/community";
import { useLocaleTranslation } from "~/lib/i18n/client";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";
import {
  getTwitchEmbedParentHost,
  loadTwitchPlayerScript,
  type TwitchPlayerInstance,
} from "~/lib/twitch/embed";
import { viewerSessionQueryOptions } from "~/lib/viewer-session-query";

const HOME_LIVE_CHANNELS_CACHE_KEY = "request-bot:home-live-channels:v2";
const HOME_LIVE_CHANNELS_CACHE_TTL_MS = 5 * 60 * 1000;

type HomeLiveChannelsCache = {
  cachedAt: number;
  payload: HomeLiveChannelsResponse;
};

export const Route = createFileRoute("/")({
  head: async () => ({
    meta: [
      {
        title: await getLocalizedPageTitle({
          namespace: "home",
          key: "meta.title",
        }),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { t } = useLocaleTranslation(["common", "home"]);
  const [showDemoChannels, setShowDemoChannels] = useState(import.meta.env.DEV);
  const [cachedLiveChannels] = useState(() => readHomeLiveChannelsCache());
  const { data: sessionData } = useQuery({
    queryKey: ["viewer-session"],
    queryFn: async () => {
      const response = await fetch("/api/session", {
        credentials: "include",
      });
      return response.json() as Promise<{
        viewer: null | {
          user: {
            displayName: string;
            login: string;
            profileImageUrl?: string | null;
            isAdmin?: boolean;
          };
          channel: {
            slug: string;
          } | null;
          manageableChannels?: Array<{
            slug: string;
            displayName: string;
            login: string;
            isLive: boolean;
          }>;
        };
      }>;
    },
    ...viewerSessionQueryOptions,
  });
  const liveChannelsQuery = useQuery({
    queryKey: ["home-live-channels"],
    enabled: !showDemoChannels,
    queryFn: async () => {
      const response = await fetch("/api/channels/live");
      return response.json() as Promise<HomeLiveChannelsResponse>;
    },
    initialData: cachedLiveChannels?.payload,
    initialDataUpdatedAt: cachedLiveChannels?.cachedAt,
    staleTime: HOME_LIVE_CHANNELS_CACHE_TTL_MS,
  });
  const demoChannelsQuery = useQuery({
    queryKey: ["home-demo-channels"],
    enabled: showDemoChannels,
    queryFn: async () => {
      const response = await fetch("/api/channels/live?source=rocksmith");
      if (!response.ok) {
        throw new Error("Unable to load Rocksmith demo channels.");
      }

      return response.json() as Promise<HomeLiveChannelsResponse>;
    },
  });
  const viewer = sessionData?.viewer ?? null;
  const defaultManageableChannel = viewer?.channel?.slug
    ? viewer.channel
    : viewer?.manageableChannels?.[0]
      ? { slug: viewer.manageableChannels[0].slug }
      : null;
  useEffect(() => {
    if (!liveChannelsQuery.data) {
      return;
    }

    writeHomeLiveChannelsCache(liveChannelsQuery.data);
  }, [liveChannelsQuery.data]);

  const liveChannelsResponse = liveChannelsQuery.data ?? null;
  const liveChannels = liveChannelsResponse?.channels ?? [];
  const liveCommunity = liveChannelsResponse?.community ?? null;
  const communityTopArtists = liveCommunity?.topArtistsToday.slice(0, 4) ?? [];
  const communityNowPlaying = liveChannels
    .filter((channel) => channel.currentItem)
    .slice(0, 4);
  const shouldShowCommunity =
    !!liveCommunity &&
    (liveCommunity.requestsPlayedToday > 0 ||
      communityTopArtists.length > 0 ||
      communityNowPlaying.length > 0);
  const rocksmithDemoChannels = demoChannelsQuery.data?.channels ?? [];
  const displayedChannels = showDemoChannels
    ? rocksmithDemoChannels
    : liveChannels;
  const isDisplayedChannelsLoading = showDemoChannels
    ? demoChannelsQuery.isLoading
    : liveChannelsQuery.isLoading;
  const toggleLabel = showDemoChannels
    ? t("live.showLive", { ns: "home" })
    : t("live.showDemo", { ns: "home" });
  const sourceLabel = showDemoChannels
    ? t("live.demoOnly", { ns: "home" })
    : null;
  const [featuredChannel, ...secondaryChannels] = displayedChannels;

  return (
    <section className="page-section-stack grid gap-6 pb-6 [container-type:inline-size] xl:grid-cols-[0.72fr_1.28fr]">
      <div className="surface-grid surface-noise border border-(--border-strong) bg-(--panel) p-6 shadow-none md:p-8 max-[720px]:border-x-0 max-[720px]:border-t-0 max-[720px]:bg-transparent max-[720px]:px-0 max-[720px]:pb-4 max-[720px]:pt-0 max-[720px]:shadow-none max-[720px]:[background-image:none]">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-(--brand-deep)">
          {t("hero.eyebrow", { ns: "home" })}
        </p>
        <h1 className="mt-4 max-w-3xl text-6xl font-semibold tracking-[-0.04em] text-(--text) md:text-7xl max-[960px]:text-[clamp(2.85rem,7.8vw,5rem)] max-[720px]:text-[clamp(2.5rem,10vw,3.6rem)]">
          {t("hero.title", { ns: "home" })}
        </h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <FeatureBlock
            icon={Search}
            title={t("actions.findSong", { ns: "home" })}
            action={
              <Button
                asChild
                size="lg"
                className="flex h-auto min-h-12 w-full whitespace-normal px-4 py-3 text-center leading-5"
              >
                <Link to="/search" className="w-full no-underline">
                  {t("actions.searchSongs", { ns: "home" })}
                </Link>
              </Button>
            }
          />
          <FeatureBlock
            icon={Settings2}
            title={t("actions.manageChannel", { ns: "home" })}
            action={
              <Button
                asChild
                size="lg"
                className="flex h-auto min-h-12 w-full whitespace-normal px-4 py-3 text-center leading-5"
              >
                {defaultManageableChannel ? (
                  <Link
                    to="/dashboard/settings"
                    className="w-full no-underline"
                  >
                    {t("actions.openSettings", { ns: "home" })}
                  </Link>
                ) : (
                  <a href="/auth/twitch/start" className="w-full no-underline">
                    {t("auth.signIn", { ns: "common" })}
                  </a>
                )}
              </Button>
            }
          />
        </div>

        <div className="mt-8 grid gap-4 border-t border-(--border) pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
              {t("about.eyebrow", { ns: "home" })}
            </p>
            <p className="mt-3 text-lg leading-8 text-(--text)">
              {t("about.body", { ns: "home" })}
            </p>
          </div>
          <div className="overflow-hidden border border-(--border)">
            <FeatureListRow
              icon={Search}
              title={t("features.surfaceRequestsTitle", { ns: "home" })}
              description={t("features.surfaceRequestsBody", { ns: "home" })}
            />
            <FeatureListRow
              icon={Radio}
              title={t("features.moderationTitle", { ns: "home" })}
              description={t("features.moderationBody", { ns: "home" })}
            />
            <FeatureListRow
              icon={ListMusic}
              title={t("features.queueTitle", { ns: "home" })}
              description={t("features.queueBody", { ns: "home" })}
            />
            <FeatureListRow
              icon={Settings2}
              title={t("features.rulesTitle", { ns: "home" })}
              description={t("features.rulesBody", { ns: "home" })}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <section className="border border-(--border) bg-(--panel-strong) p-6 shadow-none md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
                {t("live.eyebrow", { ns: "home" })}
              </p>
              <h2 className="mt-3 text-5xl font-semibold text-(--text)">
                {t("live.title", { ns: "home" })}
              </h2>
            </div>
            <div className="grid justify-items-end gap-2 text-right">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDemoChannels((current) => !current)}
                  className="h-7 border-sky-500/30 bg-sky-500/10 px-2.5 text-[10px] tracking-[0.1em] text-sky-200 hover:border-sky-400 hover:bg-sky-500/15 hover:text-sky-100"
                >
                  {toggleLabel}
                </Button>
                {isDisplayedChannelsLoading ? (
                  <Skeleton className="h-7 w-24 border border-(--border) bg-(--panel-soft)" />
                ) : (
                  <div className="border border-(--border) bg-(--panel-soft) px-3 py-1 text-xs uppercase tracking-[0.22em] text-(--muted)">
                    {t("live.activeCount", {
                      ns: "home",
                      count: displayedChannels.length,
                    })}
                  </div>
                )}
              </div>
              {sourceLabel ? (
                <p className="max-w-[24rem] text-xs leading-5 text-(--muted)">
                  {sourceLabel}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            {isDisplayedChannelsLoading ? (
              <LiveChannelsSectionSkeleton />
            ) : featuredChannel ? (
              <>
                <FeaturedLiveChannelCard
                  key={featuredChannel.id}
                  channel={featuredChannel}
                  communityAddon={
                    !showDemoChannels &&
                    shouldShowCommunity &&
                    liveCommunity ? (
                      <FeaturedCommunityAddon
                        requestsPlayedToday={liveCommunity.requestsPlayedToday}
                        topArtists={communityTopArtists}
                        nowPlaying={communityNowPlaying}
                      />
                    ) : null
                  }
                />
                {secondaryChannels.length ? (
                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {secondaryChannels.map((channel) => (
                      <CompactLiveChannelCard
                        key={channel.id}
                        channel={channel}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="border border-dashed border-(--border) bg-(--panel-soft) px-4 py-5 text-sm leading-7 text-(--muted)">
                {t("live.empty", { ns: "home" })}
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function FeaturedLiveChannelCard(props: {
  channel: HomeLiveChannel;
  communityAddon?: React.ReactNode;
}) {
  const { t } = useLocaleTranslation("home");
  const { channel } = props;
  const previewAlt = t("live.previewAlt", { displayName: channel.displayName });
  const playlistHref =
    channel.playlistHref === undefined
      ? `/${channel.slug}`
      : channel.playlistHref;

  return (
    <div className="overflow-hidden border border-(--border-strong) bg-(--panel-soft)">
      {channel.streamThumbnailUrl || channel.login ? (
        <div className="border-b border-(--border)">
          <FeaturedLiveChannelPreview channel={channel} alt={previewAlt} />
        </div>
      ) : null}
      <div className="p-6 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-4xl font-semibold text-(--text)">
              {channel.displayName}
            </p>
            {channel.streamTitle ? (
              <p className="mt-4 line-clamp-2 text-base leading-7 text-(--muted)">
                {channel.streamTitle}
              </p>
            ) : null}
            {channel.playedTodayCount > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <LiveChannelStatPill>
                  {t("live.playedToday", {
                    count: channel.playedTodayCount,
                    ns: "home",
                  })}
                </LiveChannelStatPill>
              </div>
            ) : null}
          </div>
          <div className="mt-1 inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            <Radio className="h-3.5 w-3.5" />
            {t("live.status", { ns: "home" })}
          </div>
        </div>
        {channel.currentItem || channel.nextItem ? (
          <div className="mt-6 grid gap-3 border border-(--border) bg-(--panel) p-5">
            {channel.currentItem ? (
              <QueueSnippet
                icon={Radio}
                label={t("live.nowPlaying", { ns: "home" })}
                title={channel.currentItem.title}
                artist={channel.currentItem.artist}
              />
            ) : null}
            {channel.nextItem ? (
              <QueueSnippet
                icon={ListMusic}
                label={t(
                  channel.currentItem ? "live.upNext" : "live.nextRequest",
                  { ns: "home" }
                )}
                title={channel.nextItem.title}
                artist={channel.nextItem.artist}
              />
            ) : null}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-4">
          {playlistHref ? (
            channel.playlistExternal ? (
              <Button asChild variant="default" size="sm">
                <a
                  href={playlistHref}
                  target="_blank"
                  rel="noreferrer"
                  className="no-underline"
                >
                  {t("live.openPlaylist")}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button asChild variant="default" size="sm">
                <Link
                  to="/$slug"
                  params={{ slug: channel.slug }}
                  className="no-underline"
                >
                  {t("live.openPlaylist")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://twitch.tv/${channel.login}`}
              target="_blank"
              rel="noreferrer"
              className="no-underline"
            >
              {t("live.watchOnTwitch")}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
        {props.communityAddon ? (
          <div className="mt-6 border-t border-(--border) pt-6">
            {props.communityAddon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FeaturedLiveChannelPreview(props: {
  channel: HomeLiveChannel;
  alt: string;
}) {
  const { t } = useLocaleTranslation("home");
  const { channel } = props;
  const [playerParentHost, setPlayerParentHost] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerFailed, setPlayerFailed] = useState(false);
  const [pendingUserPlayback, setPendingUserPlayback] = useState(false);
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const playerId = `featured-live-player-${channel.id}`;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setPlayerParentHost(getTwitchEmbedParentHost(window.location));
  }, []);

  useEffect(() => {
    setPlayerReady(false);
    setPlayerVisible(false);
    setPlayerFailed(false);
    setPendingUserPlayback(false);
    playerRef.current = null;
  }, [channel.id, channel.login]);

  useEffect(() => {
    if (typeof document === "undefined" || !playerParentHost || playerFailed) {
      return;
    }

    let cancelled = false;
    const markReady = () => {
      if (cancelled) {
        return;
      }

      setPlayerReady(true);
    };
    const markPlaying = () => {
      if (cancelled) {
        return;
      }

      setPlayerReady(true);
      setPlayerVisible(true);
      setPendingUserPlayback(false);
    };

    void loadTwitchPlayerScript()
      .then((TwitchPlayer) => {
        if (cancelled) {
          return;
        }

        const container = document.getElementById(playerId);
        if (!container) {
          return;
        }

        container.replaceChildren();

        const player = new TwitchPlayer(playerId, {
          channel: channel.login,
          parent: [playerParentHost],
          width: "100%",
          height: "100%",
          autoplay: true,
          muted: true,
        });
        playerRef.current = player;

        player.addEventListener(TwitchPlayer.READY, markReady);
        player.addEventListener(TwitchPlayer.PLAYING, markPlaying);
        player.addEventListener(TwitchPlayer.PLAYBACK_BLOCKED, markReady);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        console.warn("Unable to load the Twitch homepage embed.", {
          login: channel.login,
          error: error instanceof Error ? error.message : String(error),
        });
        setPlayerFailed(true);
      });

    return () => {
      cancelled = true;
      playerRef.current = null;
      document.getElementById(playerId)?.replaceChildren();
    };
  }, [channel.login, playerFailed, playerId, playerParentHost]);

  useEffect(() => {
    if (!pendingUserPlayback || !playerReady || !playerRef.current) {
      return;
    }

    playerRef.current.setMuted(true);
    playerRef.current.play();
    setPlayerVisible(true);
  }, [pendingUserPlayback, playerReady]);

  const handlePlayClick = () => {
    setPendingUserPlayback(true);

    if (!playerRef.current) {
      return;
    }

    playerRef.current.setMuted(true);
    playerRef.current.play();
    setPlayerVisible(true);
  };

  return (
    <div className="relative aspect-video max-h-[420px] w-full overflow-hidden bg-black">
      {channel.streamThumbnailUrl ? (
        <img
          src={channel.streamThumbnailUrl}
          alt={props.alt}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            playerVisible ? "opacity-0" : "opacity-100"
          }`}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      ) : null}
      {!playerFailed && playerParentHost ? (
        <div
          id={playerId}
          className={`absolute inset-0 transition-opacity duration-300 ${
            playerVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
      {!playerFailed && playerParentHost && !playerVisible ? (
        <button
          type="button"
          onClick={handlePlayClick}
          className="absolute inset-x-0 bottom-5 mx-auto inline-flex w-auto items-center gap-3 border border-white/15 bg-black/75 px-4 py-3 text-sm font-semibold tracking-[0.08em] text-white backdrop-blur-sm transition-colors hover:bg-black/85"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-(--accent-strong) text-black">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
          {t("live.playStream", { ns: "home" })}
        </button>
      ) : null}
    </div>
  );
}

function CompactLiveChannelCard(props: { channel: HomeLiveChannel }) {
  const { t } = useLocaleTranslation("home");
  const { channel } = props;
  const playlistHref =
    channel.playlistHref === undefined
      ? `/${channel.slug}`
      : channel.playlistHref;

  return (
    <div className="flex h-full flex-col border border-(--border) bg-(--panel-muted) p-5">
      <div className="flex-1">
        {channel.streamThumbnailUrl ? (
          <div className="mb-5 overflow-hidden border border-(--border)">
            <img
              src={channel.streamThumbnailUrl
                .replace("640x360", "480x270")
                .replace("{width}", "480")
                .replace("{height}", "270")}
              alt={t("live.previewAlt", { displayName: channel.displayName })}
              className="block aspect-video w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold text-(--text)">
              {channel.displayName}
            </p>
            {channel.streamTitle ? (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-(--muted)">
                {channel.streamTitle}
              </p>
            ) : null}
            {channel.playedTodayCount > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <LiveChannelStatPill>
                  {t("live.playedToday", {
                    count: channel.playedTodayCount,
                    ns: "home",
                  })}
                </LiveChannelStatPill>
              </div>
            ) : null}
          </div>
          <Radio className="mt-1 h-4 w-4 shrink-0 text-(--accent-strong)" />
        </div>
        {channel.currentItem || channel.nextItem ? (
          <div className="mt-5 grid gap-2 border border-(--border) bg-(--panel) p-4">
            <QueueSnippet
              icon={channel.currentItem ? Radio : ListMusic}
              label={t(
                channel.currentItem ? "live.nowPlaying" : "live.nextRequest",
                { ns: "home" }
              )}
              title={
                channel.currentItem?.title ?? channel.nextItem?.title ?? ""
              }
              artist={channel.currentItem?.artist ?? channel.nextItem?.artist}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        {playlistHref ? (
          channel.playlistExternal ? (
            <Button asChild variant="default" size="sm">
              <a
                href={playlistHref}
                target="_blank"
                rel="noreferrer"
                className="no-underline"
              >
                {t("live.openPlaylist")}
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <Button asChild variant="default" size="sm">
              <Link
                to="/$slug"
                params={{ slug: channel.slug }}
                className="no-underline"
              >
                {t("live.openPlaylist")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )
        ) : null}
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://twitch.tv/${channel.login}`}
            target="_blank"
            rel="noreferrer"
            className="no-underline"
          >
            {t("live.watchOnTwitch")}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function QueueSnippet(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  artist?: string | null;
}) {
  const Icon = props.icon;

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) bg-(--panel-soft) text-(--brand)">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
          {props.label}
        </p>
        <p className="truncate text-sm font-medium text-(--text)">
          {props.title}
        </p>
        {props.artist ? (
          <p className="truncate text-xs text-(--muted)">{props.artist}</p>
        ) : null}
      </div>
    </div>
  );
}

function CompactCommunityMetric(props: { label: string; value: string }) {
  return (
    <div className="min-w-[11rem] border border-(--border) bg-(--panel-soft) px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
          {props.label}
        </p>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-(--border) bg-(--panel-muted) text-(--brand)">
          <Flame className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-(--text)">
        {props.value}
      </p>
    </div>
  );
}

function CommunityRowsCard(props: {
  title: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { t } = useLocaleTranslation("home");

  return (
    <div className="border border-(--border) bg-(--panel-soft) p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
        {props.title}
      </p>
      {!props.isEmpty ? (
        <div className="mt-4 overflow-hidden border border-(--border)">
          {props.children}
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-(--border) bg-(--panel) px-4 py-5 text-sm leading-6 text-(--muted)">
          {t("community.empty", { ns: "home" })}
        </div>
      )}
    </div>
  );
}

function ArtistTrendCard(props: {
  title: string;
  items: HomeCommunityArtistTrend[];
}) {
  const { t } = useLocaleTranslation("home");

  return (
    <CommunityRowsCard title={props.title} isEmpty={!props.items.length}>
      {props.items.map((item, index) => (
        <div
          key={item.artist}
          className={`flex items-center justify-between gap-3 px-4 py-3 ${
            index % 2 === 0 ? "bg-(--panel)" : "bg-(--panel-muted)"
          }`}
        >
          <p className="min-w-0 truncate text-sm font-medium text-(--text)">
            {item.artist}
          </p>
          <span className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-(--muted)">
            {t("community.plays", { ns: "home", count: item.playCount })}
          </span>
        </div>
      ))}
    </CommunityRowsCard>
  );
}

function NowPlayingCard(props: { items: HomeLiveChannel[] }) {
  const { t } = useLocaleTranslation("home");

  return (
    <CommunityRowsCard
      title={t("live.nowPlaying", { ns: "home" })}
      isEmpty={!props.items.length}
    >
      {props.items.map((channel, index) => (
        <div
          key={channel.id}
          className={`flex items-center justify-between gap-4 px-4 py-3 ${
            index % 2 === 0 ? "bg-(--panel)" : "bg-(--panel-muted)"
          }`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-(--text)">
              {channel.currentItem?.title ?? ""}
            </p>
            {channel.currentItem?.artist ? (
              <p className="truncate text-xs text-(--muted)">
                {channel.currentItem.artist}
              </p>
            ) : null}
          </div>
          <a
            href={`https://twitch.tv/${channel.login}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-(--brand-deep) underline-offset-4 hover:underline"
          >
            <span className="truncate">{channel.displayName}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ))}
    </CommunityRowsCard>
  );
}

function FeaturedCommunityAddon(props: {
  requestsPlayedToday: number;
  topArtists: HomeCommunityArtistTrend[];
  nowPlaying: HomeLiveChannel[];
}) {
  const { t } = useLocaleTranslation("home");

  return (
    <div className="grid gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
        {t("community.eyebrow", { ns: "home" })}
      </p>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <CompactCommunityMetric
          label={t("community.requestsToday", { ns: "home" })}
          value={formatHomeCount(props.requestsPlayedToday)}
        />
        <ArtistTrendCard
          title={t("community.topArtists", { ns: "home" })}
          items={props.topArtists}
        />
        <NowPlayingCard items={props.nowPlaying} />
      </div>
    </div>
  );
}

function LiveChannelStatPill(props: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 border border-(--border) bg-(--panel) px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
      <Flame className="h-3.5 w-3.5 text-(--brand)" />
      {props.children}
    </div>
  );
}

function LiveChannelsSectionSkeleton() {
  return (
    <>
      <div className="overflow-hidden border border-(--border-strong) bg-(--panel-soft)">
        <Skeleton className="aspect-video w-full rounded-none bg-(--panel-muted)" />
        <div className="p-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-8 w-52 bg-(--panel-muted)" />
              <Skeleton className="mt-2 h-5 w-32 bg-(--panel-muted)" />
              <Skeleton className="mt-5 h-4 w-full bg-(--panel-muted)" />
              <Skeleton className="mt-2 h-4 w-3/4 bg-(--panel-muted)" />
            </div>
            <Skeleton className="h-7 w-16 bg-(--panel-muted)" />
          </div>
          <div className="mt-6 grid gap-3 border border-(--border) bg-(--panel) p-5">
            <LiveQueueSnippetSkeleton />
            <LiveQueueSnippetSkeleton />
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            <Skeleton className="h-9 w-32 bg-(--panel-muted)" />
            <Skeleton className="h-9 w-36 bg-(--panel-muted)" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CompactLiveChannelCardSkeleton />
        <CompactLiveChannelCardSkeleton />
      </div>
    </>
  );
}

function CompactLiveChannelCardSkeleton() {
  return (
    <div className="border border-(--border) bg-(--panel-muted) p-5">
      <Skeleton className="mb-5 aspect-video w-full bg-(--panel)" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 w-36 bg-(--panel)" />
          <Skeleton className="mt-2 h-4 w-24 bg-(--panel)" />
          <Skeleton className="mt-3 h-4 w-full bg-(--panel)" />
          <Skeleton className="mt-2 h-4 w-4/5 bg-(--panel)" />
        </div>
        <Skeleton className="mt-1 h-4 w-4 bg-(--panel)" />
      </div>
      <div className="mt-5 grid gap-2 border border-(--border) bg-(--panel) p-4">
        <LiveQueueSnippetSkeleton />
      </div>
      <div className="mt-5 flex flex-wrap gap-4">
        <Skeleton className="h-9 w-28 bg-(--panel)" />
        <Skeleton className="h-9 w-32 bg-(--panel)" />
      </div>
    </div>
  );
}

function LiveQueueSnippetSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="h-9 w-9 shrink-0 bg-(--panel-soft)" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3 w-24 bg-(--panel-soft)" />
        <Skeleton className="mt-2 h-4 w-40 bg-(--panel-soft)" />
        <Skeleton className="mt-2 h-3 w-28 bg-(--panel-soft)" />
      </div>
    </div>
  );
}

function FeatureBlock(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action: React.ReactNode;
}) {
  const Icon = props.icon;

  return (
    <div className="border border-(--border) bg-(--panel-soft) p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-(--border) bg-(--panel-muted) text-(--brand)">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <p className="text-base font-semibold leading-6 text-(--text)">
            {props.title}
          </p>
        </div>
        <div className="min-w-0">{props.action}</div>
      </div>
    </div>
  );
}

function FeatureListRow(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const Icon = props.icon;

  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-4 border-t border-(--border) px-4 py-4 first:border-t-0 odd:bg-(--panel-soft) even:bg-(--panel-muted) md:px-5 md:py-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-(--border) bg-(--panel) text-(--brand)">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-6 text-(--text) md:text-[1.05rem]">
          {props.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-(--muted) md:text-[0.97rem]">
          {props.description}
        </p>
      </div>
    </div>
  );
}

function formatHomeCount(value: number) {
  return value.toLocaleString();
}

function readHomeLiveChannelsCache() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(HOME_LIVE_CHANNELS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<HomeLiveChannelsCache> | null;
    if (
      !parsed ||
      typeof parsed.cachedAt !== "number" ||
      !parsed.payload ||
      !Array.isArray(parsed.payload.channels)
    ) {
      return null;
    }

    if (Date.now() - parsed.cachedAt > HOME_LIVE_CHANNELS_CACHE_TTL_MS) {
      return null;
    }

    return {
      cachedAt: parsed.cachedAt,
      payload: parsed.payload as HomeLiveChannelsResponse,
    } satisfies HomeLiveChannelsCache;
  } catch {
    return null;
  }
}

function writeHomeLiveChannelsCache(payload: HomeLiveChannelsResponse) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const nextCache: HomeLiveChannelsCache = {
      cachedAt: Date.now(),
      payload,
    };
    window.localStorage.setItem(
      HOME_LIVE_CHANNELS_CACHE_KEY,
      JSON.stringify(nextCache)
    );
  } catch {
    // Ignore storage failures in private or restricted contexts.
  }
}
