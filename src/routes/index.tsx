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
import { Button } from "~/components/ui/button";
import { pageTitle } from "~/lib/page-title";

type HomeLiveChannel = {
  id: string;
  slug: string;
  displayName: string;
  login: string;
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

const devMockLiveChannels: HomeLiveChannel[] = [
  {
    id: "mock-gamut",
    slug: "gamut",
    displayName: "Gamut",
    login: "gamut",
    streamTitle: "Live requests, queue picks, and channel-driven playlist flow",
    streamThumbnailUrl:
      "https://static-cdn.jtvnw.net/previews-ttv/live_user_gamut-640x360.jpg",
    currentItem: {
      title: "Neon Noir",
      artist: "HIM",
    },
    nextItem: {
      title: "Black Cat",
      artist: "David Gilmour",
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
  const viewer = sessionData?.viewer ?? null;
  const defaultManageableChannel = viewer?.channel?.slug
    ? viewer.channel
    : viewer?.manageableChannels?.[0]
      ? { slug: viewer.manageableChannels[0].slug }
      : null;
  const liveChannels =
    data?.channels?.length && data.channels.length > 0
      ? data.channels
      : import.meta.env.DEV
        ? devMockLiveChannels
        : [];
  const isUsingDevMockLiveChannels =
    import.meta.env.DEV &&
    (!data?.channels || data.channels.length === 0) &&
    liveChannels.length > 0;
  const [featuredChannel, ...secondaryChannels] = liveChannels;

  return (
    <section className="home-page grid gap-6 px-4 pt-4 pb-6 sm:px-5 sm:pt-5 md:px-6 md:pt-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="home-page__hero surface-grid surface-noise rounded-[36px] border border-(--border-strong) bg-(--panel) p-8 shadow-(--shadow) md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-(--brand-deep)">
          Twitch Song Requests
        </p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] text-(--text) md:text-6xl">
          Search songs or manage your channel.
        </h1>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
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
        <section className="rounded-[32px] border border-(--border) bg-(--panel-strong) p-6 shadow-(--shadow-soft)">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
                Live now
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-(--text)">
                Current streamers
              </h2>
            </div>
            <div className="rounded-full border border-(--border) bg-(--panel-soft) px-3 py-1 text-xs uppercase tracking-[0.22em] text-(--muted)">
              {liveChannels.length} active
            </div>
          </div>
          {isUsingDevMockLiveChannels ? (
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-(--muted)">
              Dev preview data
            </p>
          ) : null}

          <div className="mt-5 grid gap-4">
            {featuredChannel ? (
              <>
                <FeaturedLiveChannelCard channel={featuredChannel} />
                {secondaryChannels.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
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

  return (
    <div className="overflow-hidden rounded-[28px] border border-(--border-strong) bg-(--panel-soft)">
      {channel.streamThumbnailUrl ? (
        <div className="border-b border-(--border)">
          <img
            src={channel.streamThumbnailUrl}
            alt={`${channel.displayName} live stream preview`}
            className="block aspect-video w-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      ) : null}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold text-(--text)">
              {channel.displayName}
            </p>
            <p className="mt-1 truncate text-sm text-(--brand-deep)">
              @{channel.login}
            </p>
            {channel.streamTitle ? (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-(--muted)">
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
          <div className="mt-5 grid gap-2 rounded-[22px] border border-(--border) bg-(--panel) p-4">
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
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={`https://twitch.tv/${channel.login}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-(--text) no-underline transition-colors hover:text-(--brand)"
          >
            Twitch
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={`/${channel.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-(--brand) no-underline transition-colors hover:text-(--brand-strong)"
          >
            Open playlist
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

function CompactLiveChannelCard(props: { channel: HomeLiveChannel }) {
  const { channel } = props;

  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-muted) p-4">
      {channel.streamThumbnailUrl ? (
        <div className="mb-4 overflow-hidden rounded-[18px] border border-(--border)">
          <img
            src={channel.streamThumbnailUrl
              .replace("640x360", "320x180")
              .replace("{width}", "320")
              .replace("{height}", "180")}
            alt={`${channel.displayName} live stream preview`}
            className="block aspect-video w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-(--text)">
            {channel.displayName}
          </p>
          <p className="mt-1 truncate text-sm text-(--brand-deep)">
            @{channel.login}
          </p>
        </div>
        <Radio className="mt-1 h-4 w-4 shrink-0 text-(--accent-strong)" />
      </div>
      {channel.currentItem || channel.nextItem ? (
        <div className="mt-4 grid gap-2 rounded-[18px] border border-(--border) bg-(--panel) p-3">
          <QueueSnippet
            icon={channel.currentItem ? Radio : ListMusic}
            label={channel.currentItem ? "Now playing" : "Next request"}
            title={channel.currentItem?.title ?? channel.nextItem?.title ?? ""}
            artist={channel.currentItem?.artist ?? channel.nextItem?.artist}
          />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={`https://twitch.tv/${channel.login}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-(--text) no-underline transition-colors hover:text-(--brand)"
        >
          Twitch
          <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href={`/${channel.slug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-(--brand) no-underline transition-colors hover:text-(--brand-strong)"
        >
          Open
          <ArrowRight className="h-4 w-4" />
        </a>
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
    <div className="rounded-[28px] border border-(--border) bg-(--panel-soft) p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-(--border) bg-(--panel-muted) text-(--brand)">
          <Icon className="h-5 w-5" />
        </div>
        {props.action}
      </div>
      <p className="mt-5 text-lg font-semibold text-(--text)">{props.title}</p>
      <p className="mt-2 text-sm leading-6 text-(--muted)">{props.body}</p>
    </div>
  );
}
