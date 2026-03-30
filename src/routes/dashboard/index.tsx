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
  const onlineManageableChannels = manageableChannels
    .filter((managedChannel) => managedChannel.isLive)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const botStatus = channel?.botReadyState ?? "disabled";
  const notes =
    channel && settings
      ? getOverviewNotes({
          botStatus,
          botChannelEnabled: !!settings.botChannelEnabled,
          requestsEnabled: !!settings.requestsEnabled,
          isLive: !!channel.isLive,
        })
      : [];
  const channelStatus = channel
    ? {
        value: channel.isLive ? "Live" : "Offline",
        tone: channel.isLive ? ("good" as const) : ("warn" as const),
      }
    : {
        value: "Unavailable",
        tone: "neutral" as const,
      };
  const requestsStatus = settings
    ? {
        value: settings.requestsEnabled ? "Enabled" : "Paused",
        tone: settings.requestsEnabled ? ("good" as const) : ("warn" as const),
      }
    : {
        value: "Unavailable",
        tone: "neutral" as const,
      };
  const botStatusSummary = channel
    ? {
        value: getBotStatusLabel(botStatus),
        tone:
          botStatus === "active" || botStatus === "active_offline_testing"
            ? ("good" as const)
            : botStatus === "subscription_error"
              ? ("warn" as const)
              : ("neutral" as const),
      }
    : {
        value: "Unavailable",
        tone: "neutral" as const,
      };

  return (
    <div className="page-section-stack grid gap-6 [container-type:inline-size]">
      <DashboardPageHeader
        title="Account"
        description="Channel access and owner settings."
        meta={
          <div className="grid gap-3 md:grid-cols-2">
            {publicSlug ? (
              <ExternalCard
                href={`/${publicSlug}`}
                icon={Radio}
                title="Open your playlist"
              />
            ) : null}
            {data?.session?.viewer?.channel ? (
              <ExternalCard
                href="/dashboard/settings"
                icon={Settings2}
                title="Manage channel settings"
              />
            ) : null}
          </div>
        }
        aside={
          <div className="grid min-w-[14rem] gap-2">
            <StatusIndicator
              label="Channel Status"
              value={channelStatus.value}
              tone={channelStatus.tone}
            />
            <StatusIndicator
              label="Requests"
              value={requestsStatus.value}
              tone={requestsStatus.tone}
            />
            <StatusIndicator
              label="Bot"
              value={botStatusSummary.value}
              tone={botStatusSummary.tone}
            />
          </div>
        }
      />

      {needsModeratorScopeReconnect || manageableChannels.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              Online channels you moderate
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {needsModeratorScopeReconnect ? (
              <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                Reconnect Twitch to refresh your moderated channel access.
              </div>
            ) : null}
            {onlineManageableChannels.map((managedChannel) => (
              <div
                key={managedChannel.slug}
                className="flex items-center justify-between gap-4 border border-(--border) bg-(--panel-soft) px-4 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-(--text)">
                      {managedChannel.displayName}
                    </p>
                    <span
                      className={`border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        managedChannel.isLive
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                          : "border-(--border) bg-(--panel) text-(--muted)"
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
            {!needsModeratorScopeReconnect &&
            onlineManageableChannels.length === 0 ? (
              <p className="text-sm text-(--muted)">
                No moderated channels are live right now.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {notes.length > 0 ? (
        <section className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Notes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {notes.map((note, index) => (
                <div
                  key={note.title}
                  className={`border px-4 py-4 shadow-none ${
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
      ) : null}
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

  if (input.botStatus === "active_offline_testing") {
    return [
      {
        title: "Offline testing is on",
        body: "Requests stay available while you test the bot offline.",
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

function StatusIndicator(props: {
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    props.tone === "good"
      ? "text-emerald-200"
      : props.tone === "warn"
        ? "text-amber-200"
        : "text-(--text)";

  return (
    <div className="border border-(--border) bg-(--panel-soft) px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
          {props.label}
        </p>
        <p className={`text-sm font-semibold ${toneClass}`}>{props.value}</p>
      </div>
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
      className="group border border-(--border) bg-(--panel-soft) p-4 no-underline transition-all hover:border-(--brand) hover:bg-(--panel-muted)"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center border border-(--border) bg-(--panel-muted) text-(--brand)">
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
