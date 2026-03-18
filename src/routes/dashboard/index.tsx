// Route: Renders the signed-in dashboard home with accessible channels and shortcuts.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ExternalLink,
  ListMusic,
  Mic2,
  Radio,
  Settings2,
  Shield,
  StickyNote,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getBotStatusLabel } from "~/lib/bot-status";
import { pageTitle } from "~/lib/page-title";

type DashboardOverviewData = {
  playlist: {
    items: Array<{
      id: string;
      status: string;
      position: number;
      songTitle: string;
      songArtist?: string;
    }>;
  };
  moderation: {
    blocks: unknown[];
    setlist: unknown[];
    vipTokens: Array<{ balance: number }>;
  };
  settings: {
    channel?: {
      slug?: string;
      login?: string;
      displayName?: string;
      botReadyState?: string;
      isLive?: boolean;
      botEnabled?: boolean;
    };
    settings?: {
      botChannelEnabled?: boolean;
      publicPlaylistEnabled?: boolean;
      requestsEnabled?: boolean;
    };
    bot?: {
      connected?: boolean;
    };
  };
  session: {
    viewer: null | {
      user: {
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
      needsModeratorScopeReconnect?: boolean;
    };
  };
};

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: pageTitle("Dashboard") }],
  }),
  component: DashboardOverviewPage,
});

function DashboardOverviewPage() {
  const { data } = useQuery<DashboardOverviewData>({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const [
        playlistResponse,
        moderationResponse,
        settingsResponse,
        sessionResponse,
      ] = await Promise.all([
        fetch("/api/dashboard/playlist"),
        fetch("/api/dashboard/moderation"),
        fetch("/api/dashboard/settings"),
        fetch("/api/session", {
          credentials: "include",
        }),
      ]);

      return {
        playlist: await playlistResponse.json(),
        moderation: await moderationResponse.json(),
        settings: await settingsResponse.json(),
        session: await sessionResponse.json(),
      } as DashboardOverviewData;
    },
  });

  const items = data?.playlist?.items ?? [];
  const currentItem = items.find((item) => item.status === "current") ?? null;
  const queuedItems = items.filter((item) => item.status === "queued");
  const nextUp = queuedItems[0] ?? null;
  const blockedCount = data?.moderation?.blocks?.length ?? 0;
  const setlistCount = data?.moderation?.setlist?.length ?? 0;
  const vipTokensIssued =
    data?.moderation?.vipTokens?.reduce(
      (total, token) => total + token.balance,
      0
    ) ?? 0;
  const channel = data?.settings?.channel;
  const settings = data?.settings?.settings;
  const isAdmin = !!data?.session?.viewer?.user?.isAdmin;
  const publicSlug =
    data?.session?.viewer?.channel?.slug ?? channel?.slug ?? null;
  const manageableChannels = data?.session?.viewer?.manageableChannels ?? [];
  const needsModeratorScopeReconnect =
    !!data?.session?.viewer?.needsModeratorScopeReconnect;
  const sortedManageableChannels = [...manageableChannels].sort(
    (left, right) =>
      Number(right.isLive) - Number(left.isLive) ||
      left.displayName.localeCompare(right.displayName)
  );
  const botStatus = channel?.botReadyState ?? "disabled";
  const notes = getOverviewNotes({
    botStatus,
    botConnected: !!data?.settings?.bot?.connected,
    botChannelEnabled: !!settings?.botChannelEnabled,
    requestsEnabled: !!settings?.requestsEnabled,
    isLive: !!channel?.isLive,
  });

  return (
    <div className="grid gap-6">
      <section className="surface-grid surface-noise rounded-[34px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow) md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--brand-deep)">
              Overview
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-(--text)">
              {channel?.displayName ?? "Your channel"} at a glance
            </h1>
          </div>

          <div className="grid min-w-[280px] gap-3">
            <StatusPill
              label="Bot"
              value={getBotStatusLabel(botStatus)}
              tone={
                botStatus === "active"
                  ? "good"
                  : botStatus === "subscription_error"
                    ? "warn"
                    : "neutral"
              }
            />
            <StatusPill
              label="Stream"
              value={channel?.isLive ? "Live" : "Offline"}
              tone={channel?.isLive ? "good" : "neutral"}
            />
            <StatusPill
              label="Requests"
              value={settings?.requestsEnabled ? "Enabled" : "Paused"}
              tone={settings?.requestsEnabled ? "good" : "warn"}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <QuickLinkCard
            to="/dashboard/playlist"
            icon={ListMusic}
            title="Open playlist"
            description="Queue"
          />
          <QuickLinkCard
            to="/dashboard/moderation"
            icon={Shield}
            title="Moderation"
            description="Rules and VIP"
          />
          <QuickLinkCard
            to="/dashboard/settings"
            icon={Settings2}
            title="Settings"
            description="Options"
          />
          {publicSlug ? (
            <ExternalCard
              href={`/${publicSlug}`}
              icon={Radio}
              title="Public playlist"
              description="Open page"
            />
          ) : (
            <ExternalCard
              href={
                channel?.login
                  ? `https://twitch.tv/${channel.login}`
                  : "/dashboard"
              }
              icon={Radio}
              title="Channel link"
              description="Open channel"
            />
          )}
        </div>
      </section>

      {needsModeratorScopeReconnect || sortedManageableChannels.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Channels</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {needsModeratorScopeReconnect ? (
              <div className="rounded-[24px] border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                Reconnect Twitch.
              </div>
            ) : null}
            {sortedManageableChannels.map((managedChannel) => (
              <div
                key={managedChannel.slug}
                className={`flex items-center justify-between gap-4 rounded-[24px] border px-4 py-4 ${
                  managedChannel.isLive
                    ? "border-(--border) bg-(--panel-soft)"
                    : "border-(--border) bg-(--panel-muted)"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-(--text)">
                      {managedChannel.displayName}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        managedChannel.isLive
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-(--panel) text-(--muted)"
                      }`}
                    >
                      {managedChannel.isLive ? "Live" : "Offline"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-(--muted)">
                    @{managedChannel.login}
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link
                    to="/dashboard/playlist"
                    search={{ channel: managedChannel.slug }}
                  >
                    <Mic2 className="mr-2 h-4 w-4" />
                    Open playlist
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Songs in playlist" value={items.length} />
        <MetricCard label="Queued next" value={queuedItems.length} />
        <MetricCard label="Blocked entries" value={blockedCount} />
        <MetricCard label="VIP tokens issued" value={vipTokensIssued} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Queue snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <QueueHighlight
              label="Now playing"
              title={currentItem?.songTitle ?? "Nothing marked as current"}
              subtitle={currentItem?.songArtist ?? "Select a song in Playlist."}
              tone="current"
            />
            <QueueHighlight
              label="Next up"
              title={nextUp?.songTitle ?? "No queued song yet"}
              subtitle={nextUp?.songArtist ?? "Queue is empty."}
              tone="next"
            />

            <div className="rounded-[26px] border border-(--border) bg-(--panel-soft) p-4">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-(--muted)">
                Upcoming queue
              </p>
              <div className="mt-4 grid gap-2">
                {queuedItems.slice(0, 5).map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 rounded-[20px] px-4 py-3 ${
                      index % 2 === 0
                        ? "bg-(--panel-strong)"
                        : "bg-(--panel-muted)"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-(--text)">
                        {item.songTitle}
                      </p>
                      <p className="truncate text-sm text-(--muted)">
                        {item.songArtist ?? "Unknown artist"}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-(--brand-deep)">
                      #{item.position}
                    </span>
                  </div>
                ))}
                {queuedItems.length === 0 ? (
                  <p className="text-sm leading-7 text-(--muted)">
                    No queued songs yet.
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Next steps</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {notes.map((note, index) => (
                <div
                  key={note.title}
                  className={`rounded-[24px] border px-4 py-4 shadow-(--shadow-soft) ${
                    index === 0
                      ? "border-amber-300 bg-[#3a3117]"
                      : index === 1
                        ? "border-[#37525d] bg-[#18262d]"
                        : "border-[#4c3f62] bg-[#211a2d]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                    <div>
                      <p className="font-semibold text-white">{note.title}</p>
                      <p className="mt-1 text-sm leading-6 text-white/75">
                        {note.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Channel controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ActionRow
                title="Playlist"
                description="Open"
                to="/dashboard/playlist"
              />
              <ActionRow
                title="Moderation"
                description={`${blockedCount} blocked, ${setlistCount} setlist.`}
                to="/dashboard/moderation"
              />
              <ActionRow
                title="Settings"
                description="Open"
                to="/dashboard/settings"
              />
              {isAdmin ? (
                <ActionRow
                  title="Operations"
                  description="Open"
                  to="/dashboard/admin"
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function getOverviewNotes(input: {
  botStatus: string;
  botConnected: boolean;
  botChannelEnabled: boolean;
  requestsEnabled: boolean;
  isLive: boolean;
}) {
  const notes: Array<{ title: string; body: string }> = [];

  if (!input.botConnected) {
    notes.push({
      title: "Bot account",
      body: "Needs admin setup.",
    });
  }

  if (!input.botChannelEnabled) {
    notes.push({
      title: "Enable bot",
      body: "Turn it on in Settings.",
    });
  }

  if (input.botChannelEnabled && !input.isLive) {
    notes.push({
      title: "Go live",
      body: "The bot starts when your stream is live.",
    });
  }

  if (input.botChannelEnabled && input.isLive && !input.requestsEnabled) {
    notes.push({
      title: "Requests are paused",
      body: "Turn them on in Settings.",
    });
  }

  if (input.botStatus === "active") {
    notes.push({
      title: "Ready",
      body: "Chat requests are on.",
    });
  }

  if (notes.length === 0) {
    notes.push({
      title: "Playlist",
      body: "Open it to manage songs.",
    });
  }

  return notes.slice(0, 3);
}

function StatusPill(props: {
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    props.tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : props.tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-(--border) bg-(--panel-soft) text-(--text)";

  return (
    <div className={`rounded-[22px] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">
        {props.label}
      </p>
      <p className="mt-1 text-base font-semibold capitalize">{props.value}</p>
    </div>
  );
}

function MetricCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-[28px] border border-(--border) bg-(--panel) p-5 shadow-(--shadow-soft)">
      <p className="text-sm uppercase tracking-[0.16em] text-(--muted)">
        {props.label}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-(--text)">
        {props.value}
      </p>
    </div>
  );
}

function QuickLinkCard(props: {
  to: "/dashboard/playlist" | "/dashboard/moderation" | "/dashboard/settings";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const Icon = props.icon;

  return (
    <Link
      to={props.to}
      className="group rounded-[28px] border border-(--border) bg-(--panel-soft) p-5 no-underline transition-all hover:border-(--brand) hover:bg-(--panel-muted)"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-(--border) bg-(--panel-muted) text-(--brand)">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-5 w-5 text-(--muted) transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-5 text-lg font-semibold text-(--text)">{props.title}</p>
      <p className="mt-2 text-sm leading-7 text-(--muted)">
        {props.description}
      </p>
    </Link>
  );
}

function ExternalCard(props: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const Icon = props.icon;

  return (
    <a
      href={props.href}
      className="group rounded-[28px] border border-(--border) bg-(--panel-soft) p-5 no-underline transition-all hover:border-(--brand) hover:bg-(--panel-muted)"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-(--border) bg-(--panel-muted) text-(--brand)">
          <Icon className="h-5 w-5" />
        </div>
        <ExternalLink className="h-5 w-5 text-(--muted) transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-5 text-lg font-semibold text-(--text)">{props.title}</p>
      <p className="mt-2 text-sm leading-7 text-(--muted)">
        {props.description}
      </p>
    </a>
  );
}

function QueueHighlight(props: {
  label: string;
  title: string;
  subtitle: string;
  tone: "current" | "next";
}) {
  const toneClass =
    props.tone === "current"
      ? "border-(--brand-strong) bg-(--brand) text-white"
      : "border-(--border) bg-(--panel-soft) text-(--text)";
  const subtitleClass =
    props.tone === "current" ? "text-white/80" : "text-(--muted)";

  return (
    <div className={`rounded-[26px] border px-5 py-5 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em]">
        {props.label}
      </p>
      <p className="mt-3 text-2xl font-semibold">{props.title}</p>
      <p className={`mt-2 text-sm ${subtitleClass}`}>{props.subtitle}</p>
    </div>
  );
}

function ActionRow(props: {
  title: string;
  description: string;
  to:
    | "/dashboard/playlist"
    | "/dashboard/moderation"
    | "/dashboard/settings"
    | "/dashboard/admin";
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[24px] border border-(--border) bg-(--panel-soft) px-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-(--text)">{props.title}</p>
        <p className="mt-1 text-sm leading-6 text-(--muted)">
          {props.description}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to={props.to}>Open</Link>
      </Button>
    </div>
  );
}
