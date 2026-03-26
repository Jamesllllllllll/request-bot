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
import { useState } from "react";
import { Button } from "~/components/ui/button";
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

const demoLiveChannels: HomeLiveChannel[] = [
  {
    id: "mock-christhemetalnerd",
    slug: "christhemetalnerd",
    displayName: "ChrisTheMetalNerd",
    login: "christhemetalnerd",
    streamTitle:
      "Featured playlist queue with live requests and community picks",
    streamThumbnailUrl:
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_christhemetalnerd-640x360.jpg",
    currentItem: {
      title: "Playlist",
      artist: "Featured queue",
    },
    nextItem: {
      title: "Viewer requests",
      artist: "Up next",
    },
  },
  {
    id: "mock-amisslamb44",
    slug: "amisslamb44",
    displayName: "AmissLamb44",
    login: "amisslamb44",
    streamTitle: "Playlist",
    streamThumbnailUrl:
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_amisslamb44-640x360.jpg",
    currentItem: {
      title: "Playlist",
      artist: "Live now",
    },
  },
  {
    id: "mock-jacoandfoxy",
    slug: "jacoandfoxy",
    displayName: "JacoAndFoxy",
    login: "jacoandfoxy",
    streamTitle: "Playlist",
    streamThumbnailUrl:
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_jacoandfoxy-640x360.jpg",
    currentItem: {
      title: "Playlist",
      artist: "Live now",
    },
  },
  {
    id: "mock-shaggy-malagy",
    slug: "shaggy_malagy",
    displayName: "shaggy_malagy",
    login: "shaggy_malagy",
    streamTitle: "Playlist",
    streamThumbnailUrl:
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_shaggy_malagy-640x360.jpg",
    currentItem: {
      title: "Playlist",
      artist: "Live now",
    },
  },
  {
    id: "mock-slyman85",
    slug: "slyman85",
    displayName: "Slyman85",
    login: "slyman85",
    streamTitle: "Playlist",
    streamThumbnailUrl:
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_slyman85-640x360.jpg",
    currentItem: {
      title: "Playlist",
      artist: "Live now",
    },
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: pageTitle("Home") }],
  }),
  component: HomePage,
});

function HomePage() {
  const [showDemoChannels, setShowDemoChannels] = useState(import.meta.env.DEV);
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
  const { data } = useQuery({
    queryKey: ["home-live-channels"],
    queryFn: async () => {
      const response = await fetch("/api/channels/live");
      return response.json() as Promise<{
        channels: HomeLiveChannel[];
      }>;
    },
  });
  const { data: demoData } = useQuery({
    queryKey: ["home-demo-channels"],
    enabled: showDemoChannels || import.meta.env.DEV,
    queryFn: async () => {
      const response = await fetch("/api/channels/live?source=rocksmith");
      if (!response.ok) {
        throw new Error("Unable to load Rocksmith demo channels.");
      }

      return response.json() as Promise<{
        channels: HomeLiveChannel[];
      }>;
    },
  });
  const viewer = sessionData?.viewer ?? null;
  const defaultManageableChannel = viewer?.channel?.slug
    ? viewer.channel
    : viewer?.manageableChannels?.[0]
      ? { slug: viewer.manageableChannels[0].slug }
      : null;
  const liveChannels = data?.channels ?? [];
  const rocksmithDemoChannels =
    demoData?.channels && demoData.channels.length > 0
      ? demoData.channels
      : demoLiveChannels;
  const displayedChannels = showDemoChannels
    ? rocksmithDemoChannels
    : liveChannels;
  const toggleLabel = showDemoChannels ? "Show Live" : "Show Demo";
  const sourceLabel = showDemoChannels
    ? "This is a list of streams with the Rocksmith tag for demo purposes."
    : null;
  const [featuredChannel, ...secondaryChannels] = displayedChannels;

  return (
    <section className="grid gap-6 px-4 pt-4 pb-6 [container-type:inline-size] sm:px-5 sm:pt-5 md:px-6 md:pt-6 xl:grid-cols-[0.72fr_1.28fr]">
      <div className="surface-grid surface-noise rounded-[32px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow) md:p-8 max-[720px]:rounded-none max-[720px]:border-x-0 max-[720px]:border-t-0 max-[720px]:bg-transparent max-[720px]:px-0 max-[720px]:pb-4 max-[720px]:pt-0 max-[720px]:shadow-none max-[720px]:[background-image:none]">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-(--brand-deep)">
          Twitch Song Requests
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-(--text) md:text-5xl max-[960px]:text-[clamp(2.3rem,6.5vw,3.8rem)] max-[720px]:text-[clamp(2rem,9vw,2.75rem)]">
          Search songs or manage your channel.
        </h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <FeatureBlock
            icon={Search}
            title="Find a song"
            body="Search songs and copy the request command."
            action={
              <Button asChild size="sm">
                <Link to="/search" className="no-underline">
                  Search songs
                </Link>
              </Button>
            }
          />
          <FeatureBlock
            icon={Settings2}
            title="Channel settings"
            body="Owner controls, permissions, bot settings, and overlay options."
            action={
              <Button asChild size="sm">
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
      </div>

      <div className="grid gap-6">
        <section className="rounded-[34px] border border-(--border) bg-(--panel-strong) p-6 shadow-(--shadow-soft) md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
                Live now
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-(--text)">
                Current streamers
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDemoChannels((current) => !current)}
              >
                {toggleLabel}
              </Button>
              <div className="rounded-full border border-(--border) bg-(--panel-soft) px-3 py-1 text-xs uppercase tracking-[0.22em] text-(--muted)">
                {displayedChannels.length} active
              </div>
            </div>
          </div>
          {sourceLabel ? (
            <p className="mt-3 text-xs text-(--muted)">{sourceLabel}</p>
          ) : null}

          <div className="mt-6 grid gap-5">
            {featuredChannel ? (
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
              <div className="rounded-[24px] border border-dashed border-(--border) bg-(--panel-soft) px-4 py-5 text-sm leading-7 text-(--muted)">
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
    <div className="overflow-hidden rounded-[30px] border border-(--border-strong) bg-(--panel-soft)">
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
            <p className="truncate text-3xl font-semibold text-(--text)">
              {channel.displayName}
            </p>
            <p className="mt-1 truncate text-base text-(--brand-deep)">
              @{channel.login}
            </p>
            {channel.streamTitle ? (
              <p className="mt-4 line-clamp-2 text-base leading-7 text-(--muted)">
                {channel.streamTitle}
              </p>
            ) : null}
          </div>
          <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            <Radio className="h-3.5 w-3.5" />
            Live
          </div>
        </div>
        {channel.currentItem || channel.nextItem ? (
          <div className="mt-6 grid gap-3 rounded-[24px] border border-(--border) bg-(--panel) p-5">
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
    <div className="rounded-[26px] border border-(--border) bg-(--panel-muted) p-5">
      {channel.streamThumbnailUrl ? (
        <div className="mb-5 overflow-hidden rounded-[20px] border border-(--border)">
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
          <p className="truncate text-xl font-semibold text-(--text)">
            {channel.displayName}
          </p>
          <p className="mt-1 truncate text-base text-(--brand-deep)">
            @{channel.login}
          </p>
        </div>
        <Radio className="mt-1 h-4 w-4 shrink-0 text-(--accent-strong)" />
      </div>
      {channel.currentItem || channel.nextItem ? (
        <div className="mt-5 grid gap-2 rounded-[20px] border border-(--border) bg-(--panel) p-4">
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
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--panel-soft) text-(--brand)">
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

function FeatureBlock(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-(--border) bg-(--panel-muted) text-(--brand)">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {props.action}
      </div>
      <p className="mt-4 text-base font-semibold text-(--text)">
        {props.title}
      </p>
      <p className="mt-2 text-sm leading-6 text-(--muted)">{props.body}</p>
    </div>
  );
}
