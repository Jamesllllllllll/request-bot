// Route: Renders the signed-in dashboard home with accessible channels and shortcuts.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mic2, Radio, StickyNote } from "lucide-react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
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

  const channel = data?.settings?.channel;
  const settings = data?.settings?.settings;
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
  const isOfflineTesting = botStatus === "active_offline_testing";
  const notes = getOverviewNotes({
    botStatus,
    botConnected: !!data?.settings?.bot?.connected,
    botChannelEnabled: !!settings?.botChannelEnabled,
    requestsEnabled: !!settings?.requestsEnabled,
    isLive: !!channel?.isLive,
  });

  return (
    <div className="dashboard-overview grid gap-6">
      <DashboardPageHeader
        title="Overview"
        meta={
          <div className="flex flex-wrap items-center gap-3">
            {publicSlug ? (
              <ExternalCard
                href={`/${publicSlug}`}
                icon={Radio}
                title="Public playlist"
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
                description="Twitch"
              />
            )}
            <StatusPill
              label="Bot"
              value={
                isOfflineTesting
                  ? "Offline testing enabled"
                  : getBotStatusLabel(botStatus)
              }
              tone={
                botStatus === "active" || isOfflineTesting
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
        }
      />

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

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Status preview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
              Bot
            </p>
            <div className="flex flex-wrap gap-3">
              <StatusPill label="Bot" value="Active" tone="good" />
              <StatusPill
                label="Bot"
                value="Offline testing enabled"
                tone="good"
              />
              <StatusPill
                label="Bot"
                value="Waiting to go live"
                tone="neutral"
              />
              <StatusPill
                label="Bot"
                value="Bot auth required"
                tone="neutral"
              />
              <StatusPill
                label="Bot"
                value="Broadcaster auth required"
                tone="neutral"
              />
              <StatusPill label="Bot" value="Subscription error" tone="warn" />
              <StatusPill label="Bot" value="Disabled" tone="neutral" />
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
              Stream
            </p>
            <div className="flex flex-wrap gap-3">
              <StatusPill label="Stream" value="Live" tone="good" />
              <StatusPill label="Stream" value="Offline" tone="neutral" />
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
              Requests
            </p>
            <div className="flex flex-wrap gap-3">
              <StatusPill label="Requests" value="Enabled" tone="good" />
              <StatusPill label="Requests" value="Paused" tone="warn" />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6">
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

function ExternalCard(props: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  const Icon = props.icon;

  return (
    <a
      href={props.href}
      className="group rounded-[28px] border border-(--border) bg-(--panel-soft) p-4 no-underline transition-all hover:border-(--brand) hover:bg-(--panel-muted)"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-(--border) bg-(--panel-muted) text-(--brand)">
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-(--text)">{props.title}</p>
        </div>
        <ExternalLink className="h-5 w-5 shrink-0 text-(--muted) transition-transform group-hover:translate-x-1" />
      </div>
      {props.description ? (
        <p className="mt-2 pl-14 text-sm leading-7 text-(--muted)">
          {props.description}
        </p>
      ) : null}
    </a>
  );
}
