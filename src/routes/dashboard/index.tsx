// Route: Renders a lightweight account and channel hub for signed-in users.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mic2, Radio, Settings2, StickyNote } from "lucide-react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getBotStatusLabel } from "~/lib/bot-status";
import { pageTitle } from "~/lib/page-title";

type DashboardOverviewData = {
  settings: {
    channel?: {
      slug?: string;
      login?: string;
      displayName?: string;
      botReadyState?: string;
      isLive?: boolean;
    };
    settings?: {
      botChannelEnabled?: boolean;
      requestsEnabled?: boolean;
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
    meta: [{ title: pageTitle("Account") }],
  }),
  component: DashboardOverviewPage,
});

function DashboardOverviewPage() {
  const { data } = useQuery<DashboardOverviewData>({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const sessionResponse = await fetch("/api/session", {
        credentials: "include",
      });
      const session =
        (await sessionResponse.json()) as DashboardOverviewData["session"];
      const ownsChannel = !!session.viewer?.channel;
      const settings = ownsChannel
        ? await fetch("/api/dashboard/settings").then((response) =>
            response.json()
          )
        : { channel: null, settings: null };

      return {
        settings,
        session,
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
  const notes = getOverviewNotes({
    botStatus,
    botChannelEnabled: !!settings?.botChannelEnabled,
    requestsEnabled: !!settings?.requestsEnabled,
    isLive: !!channel?.isLive,
  });

  return (
    <div className="grid gap-6 [container-type:inline-size]">
      <DashboardPageHeader
        title="Account"
        description="Channel access and owner settings."
        meta={
          <div className="flex flex-wrap items-center gap-3">
            {publicSlug ? (
              <ExternalCard
                href={`/${publicSlug}`}
                icon={Radio}
                title="Open channel page"
                description="Playlist and moderation surface"
              />
            ) : null}
            {data?.session?.viewer?.channel ? (
              <ExternalCard
                href="/dashboard/settings"
                icon={Settings2}
                title="Owner settings"
                description="Permissions, bot, policy, and overlay"
              />
            ) : null}
            <StatusPill
              label="Bot"
              value={getBotStatusLabel(botStatus)}
              tone={
                botStatus === "active" || botStatus === "active_offline_testing"
                  ? "good"
                  : botStatus === "subscription_error"
                    ? "warn"
                    : "neutral"
              }
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
            <CardTitle className="text-2xl">Your channels</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {needsModeratorScopeReconnect ? (
              <div className="rounded-[24px] border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                Reconnect Twitch to refresh your moderated channel access.
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
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link
                      to="/$slug"
                      params={{ slug: managedChannel.slug }}
                      className="no-underline"
                    >
                      <Mic2 className="mr-2 h-4 w-4" />
                      Open channel
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Channel status</CardTitle>
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
      </section>
    </div>
  );
}

function getOverviewNotes(input: {
  botStatus: string;
  botChannelEnabled: boolean;
  requestsEnabled: boolean;
  isLive: boolean;
}) {
  if (!input.botChannelEnabled) {
    return [
      {
        title: "Enable the bot",
        body: "Turn on bot control in Settings before using requests on your channel.",
      },
    ];
  }

  if (!input.isLive) {
    return [
      {
        title: "Go live to start taking requests",
        body: "Requests are meant to run while your channel is live.",
      },
    ];
  }

  if (!input.requestsEnabled) {
    return [
      {
        title: "Requests are paused",
        body: "Re-enable requests in Settings when you want viewers to add songs again.",
      },
    ];
  }

  if (
    input.botStatus === "active" ||
    input.botStatus === "active_offline_testing"
  ) {
    return [
      {
        title: "Channel is ready",
        body: "Your stream is live and requests are available.",
      },
    ];
  }

  return [
    {
      title: "Check channel status",
      body: "Make sure the bot is connected before you start taking requests.",
    },
  ];
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
