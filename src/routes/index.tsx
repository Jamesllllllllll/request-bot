// Route: Renders the public landing page with sign-in and search entry points.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ExternalLink,
  ListMusic,
  Radio,
  Search,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { pageTitle } from "~/lib/page-title";

type HomeLiveChannel = {
  id: string;
  slug: string;
  displayName: string;
  login: string;
  playlistHref?: string | null;
  playlistExternal?: boolean;
  streamTitle?: string | null;
  streamThumbnailUrl?: string | null;
  currentItem?: {
    title: string;
    artist?: string | null;
  } | null;
  nextItem?: {
    title: string;
    artist?: string | null;
  } | null;
};

const HOME_LIVE_CHANNELS_CACHE_KEY = "request-bot:home-live-channels:v1";
const HOME_LIVE_CHANNELS_CACHE_TTL_MS = 5 * 60 * 1000;

type HomeLiveChannelsResponse = {
  channels: HomeLiveChannel[];
};

type HomeLiveChannelsCache = {
  cachedAt: number;
  channels: HomeLiveChannel[];
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: pageTitle("Home") }],
  }),
  component: HomePage,
});

function HomePage() {
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
  });
  const liveChannelsQuery = useQuery({
    queryKey: ["home-live-channels"],
    enabled: !showDemoChannels,
    queryFn: async () => {
      const response = await fetch("/api/channels/live");
      return response.json() as Promise<HomeLiveChannelsResponse>;
    },
    initialData: cachedLiveChannels
      ? { channels: cachedLiveChannels.channels }
      : undefined,
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

    writeHomeLiveChannelsCache(liveChannelsQuery.data.channels);
  }, [liveChannelsQuery.data]);

  const liveChannels = liveChannelsQuery.data?.channels ?? [];
  const rocksmithDemoChannels = demoChannelsQuery.data?.channels ?? [];
  const displayedChannels = showDemoChannels
    ? rocksmithDemoChannels
    : liveChannels;
  const isDisplayedChannelsLoading = showDemoChannels
    ? demoChannelsQuery.isLoading
    : liveChannelsQuery.isLoading;
  const toggleLabel = showDemoChannels ? "Show Live" : "Show Demo";
  const sourceLabel = showDemoChannels
    ? "The streamers shown here are for demo purposes only."
    : null;
  const [featuredChannel, ...secondaryChannels] = displayedChannels;

  return (
    <section className="page-section-stack grid gap-6 pb-6 [container-type:inline-size] xl:grid-cols-[0.72fr_1.28fr]">
      <div className="surface-grid surface-noise border border-(--border-strong) bg-(--panel) p-6 shadow-none md:p-8 max-[720px]:border-x-0 max-[720px]:border-t-0 max-[720px]:bg-transparent max-[720px]:px-0 max-[720px]:pb-4 max-[720px]:pt-0 max-[720px]:shadow-none max-[720px]:[background-image:none]">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-(--brand-deep)">
          Playlist Managment for Rocksmith Streamers
        </p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-(--text) md:text-6xl max-[960px]:text-[clamp(2.5rem,6.8vw,4.4rem)] max-[720px]:text-[clamp(2.2rem,9vw,3.1rem)]">
          Search songs or manage your channel.
        </h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <FeatureBlock
            icon={Search}
            title="Find a song to request"
            action={
              <Button asChild size="lg">
                <Link to="/search" className="no-underline">
                  Search songs
                </Link>
              </Button>
            }
          />
          <FeatureBlock
            icon={Settings2}
            title="Manage your channel"
            action={
              <Button asChild size="lg">
                {defaultManageableChannel ? (
                  <Link to="/dashboard/settings" className="no-underline">
                    Open settings
                  </Link>
                ) : (
                  <a href="/auth/twitch/start" className="no-underline">
                    Sign in with Twitch
                  </a>
                )}
              </Button>
            }
          />
        </div>

        <div className="mt-8 grid gap-4 border-t border-(--border) pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
              What Is RockList.Live?
            </p>
            <p className="mt-3 text-lg leading-8 text-(--text)">
              RockList.Live helps Rocksmith streamers take requests, manage the
              playlist, and keep the show moving.
            </p>
          </div>
          <div className="overflow-hidden border border-(--border)">
            <FeatureListRow
              icon={Search}
              title="Requests from every surface"
              description="Viewers add songs on the playlist page, in chat, or from the Twitch panel."
            />
            <FeatureListRow
              icon={Radio}
              title="Moderator support"
              description="Moderators manage requests and handle VIP bumps while the stream is live."
            />
            <FeatureListRow
              icon={ListMusic}
              title="Keep the queue moving"
              description="Edit, sort, and track requests without losing the next song."
            />
            <FeatureListRow
              icon={Settings2}
              title="Set the rules"
              description="Control blacklists, setlists, moderation, and request settings for your channel."
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <section className="border border-(--border) bg-(--panel-strong) p-6 shadow-none md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
                Live now
              </p>
              <h2 className="mt-3 text-4xl font-semibold text-(--text)">
                Current streamers
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
                    {displayedChannels.length} active
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
                <FeaturedLiveChannelCard channel={featuredChannel} />
                {secondaryChannels.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
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
                No streamers are live with the bot active yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function FeaturedLiveChannelCard(props: { channel: HomeLiveChannel }) {
  const { channel } = props;
  const playlistHref =
    channel.playlistHref === undefined
      ? `/${channel.slug}`
      : channel.playlistHref;

  return (
    <div className="overflow-hidden border border-(--border-strong) bg-(--panel-soft)">
      {channel.streamThumbnailUrl ? (
        <div className="border-b border-(--border)">
          <img
            src={channel.streamThumbnailUrl}
            alt={`${channel.displayName} live stream preview`}
            className="block aspect-video max-h-[420px] w-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
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
          </div>
          <div className="mt-1 inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            <Radio className="h-3.5 w-3.5" />
            Live
          </div>
        </div>
        {channel.currentItem || channel.nextItem ? (
          <div className="mt-6 grid gap-3 border border-(--border) bg-(--panel) p-5">
            {channel.currentItem ? (
              <QueueSnippet
                icon={Radio}
                label="Now playing"
                title={channel.currentItem.title}
                artist={channel.currentItem.artist}
              />
            ) : null}
            {channel.nextItem ? (
              <QueueSnippet
                icon={ListMusic}
                label={channel.currentItem ? "Up next" : "Next request"}
                title={channel.nextItem.title}
                artist={channel.nextItem.artist}
              />
            ) : null}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-4">
          {playlistHref ? (
            <Button asChild variant="default" size="sm">
              <a
                href={playlistHref}
                {...(channel.playlistExternal
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="no-underline"
              >
                Open playlist
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://twitch.tv/${channel.login}`}
              target="_blank"
              rel="noreferrer"
              className="no-underline"
            >
              Watch on Twitch
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompactLiveChannelCard(props: { channel: HomeLiveChannel }) {
  const { channel } = props;
  const playlistHref =
    channel.playlistHref === undefined
      ? `/${channel.slug}`
      : channel.playlistHref;

  return (
    <div className="border border-(--border) bg-(--panel-muted) p-5">
      {channel.streamThumbnailUrl ? (
        <div className="mb-5 overflow-hidden border border-(--border)">
          <img
            src={channel.streamThumbnailUrl
              .replace("640x360", "480x270")
              .replace("{width}", "480")
              .replace("{height}", "270")}
            alt={`${channel.displayName} live stream preview`}
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
        </div>
        <Radio className="mt-1 h-4 w-4 shrink-0 text-(--accent-strong)" />
      </div>
      {channel.currentItem || channel.nextItem ? (
        <div className="mt-5 grid gap-2 border border-(--border) bg-(--panel) p-4">
          <QueueSnippet
            icon={channel.currentItem ? Radio : ListMusic}
            label={channel.currentItem ? "Now playing" : "Next request"}
            title={channel.currentItem?.title ?? channel.nextItem?.title ?? ""}
            artist={channel.currentItem?.artist ?? channel.nextItem?.artist}
          />
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-4">
        {playlistHref ? (
          <Button asChild variant="default" size="sm">
            <a
              href={playlistHref}
              {...(channel.playlistExternal
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className="no-underline"
            >
              Open playlist
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://twitch.tv/${channel.login}`}
            target="_blank"
            rel="noreferrer"
            className="no-underline"
          >
            Watch on Twitch
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-(--border) bg-(--panel-muted) text-(--brand)">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <p className="text-base font-semibold text-(--text)">{props.title}</p>
        </div>
        {props.action}
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
      !Array.isArray(parsed.channels)
    ) {
      return null;
    }

    if (Date.now() - parsed.cachedAt > HOME_LIVE_CHANNELS_CACHE_TTL_MS) {
      return null;
    }

    return {
      cachedAt: parsed.cachedAt,
      channels: parsed.channels as HomeLiveChannel[],
    } satisfies HomeLiveChannelsCache;
  } catch {
    return null;
  }
}

function writeHomeLiveChannelsCache(channels: HomeLiveChannel[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: HomeLiveChannelsCache = {
      cachedAt: Date.now(),
      channels,
    };
    window.localStorage.setItem(
      HOME_LIVE_CHANNELS_CACHE_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage failures in private or restricted contexts.
  }
}
