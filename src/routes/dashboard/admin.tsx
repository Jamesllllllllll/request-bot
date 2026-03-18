// Route: Renders the owner-only admin dashboard for app operations and status.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Layers3, ScrollText, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { pageTitle } from "~/lib/page-title";

type DashboardAdminData = {
  error?: string;
  bot?: {
    connected: boolean;
    configuredUsername: string;
  };
  channel?: {
    displayName?: string;
  };
  settings?: {
    adminForceBotWhileOffline: boolean;
  } | null;
  logs?: Array<{
    id: string;
    rawMessage: string;
    outcome: string;
    requesterDisplayName?: string;
    requesterLogin?: string | null;
    outcomeReason?: string | null;
    matchedSongTitle?: string | null;
    matchedSongArtist?: string | null;
    createdAt?: number;
  }>;
  audits?: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: number;
  }>;
};

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({
    meta: [{ title: pageTitle("Admin") }],
  }),
  component: DashboardAdminPage,
});

function formatRequestOutcome(
  log: NonNullable<DashboardAdminData["logs"]>[number]
) {
  switch (log.outcomeReason ?? log.outcome) {
    case "accepted":
      return "Request accepted.";
    case "vip_request":
      return "VIP request accepted.";
    case "no_song_match":
    case "not_found":
      return "No song match found.";
    case "song_lookup_failed":
      return "Song search failed.";
    case "playlist_add_failed":
      return "Song matched, but adding it failed.";
    case "user_blocked":
    case "blocked":
      return "Requester is blocked in this channel.";
    case "duplicate_window":
      return "That song was requested too recently.";
    case "active_request_limit":
      return "Requester already has too many active songs.";
    case "time_window_limit":
      return "Requester hit the request rate limit.";
    case "vip_token_required":
      return "VIP token required.";
    case "max_queue_size":
      return "Playlist is full.";
    default:
      return log.outcome.replace(/_/g, " ");
  }
}

function formatMatchedSong(
  log: NonNullable<DashboardAdminData["logs"]>[number]
) {
  if (!log.matchedSongTitle) {
    return null;
  }

  return log.matchedSongArtist
    ? `${log.matchedSongArtist} - ${log.matchedSongTitle}`
    : log.matchedSongTitle;
}

function DashboardAdminPage() {
  const [togglingOfflineTesting, setTogglingOfflineTesting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, refetch } = useQuery<DashboardAdminData>({
    queryKey: ["dashboard-admin"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/admin");
      return response.json() as Promise<DashboardAdminData>;
    },
  });

  async function setOfflineTesting(enabled: boolean) {
    setTogglingOfflineTesting(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await fetch("/api/dashboard/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "setOfflineTesting",
          enabled,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        warning?: string | null;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.message ?? "Offline testing setting could not be updated."
        );
      }
      setActionMessage(
        payload?.warning
          ? `${payload.message ?? "Updated."} ${payload.warning}`
          : (payload?.message ?? "Updated.")
      );
      await refetch();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Offline testing setting could not be updated."
      );
    } finally {
      setTogglingOfflineTesting(false);
    }
  }

  if (data?.error) {
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-(--text)">
            Operations
          </h1>
        </div>
        <div className="rounded-[24px] border border-(--border) bg-(--panel) p-5 text-sm text-(--muted)">
          You do not have access to the admin dashboard.
        </div>
      </div>
    );
  }

  const recentFailures = (data?.logs ?? []).filter(
    (log) => log.outcome !== "accepted"
  ).length;

  return (
    <div className="grid gap-6">
      <section className="surface-grid rounded-[32px] border border-(--border) bg-(--panel-strong) p-6 shadow-(--shadow) md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
              Admin
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-(--text)">
              Operations
            </h1>
          </div>

          <div className="grid min-w-[260px] gap-3">
            <AdminStatusCard
              label="Bot account"
              value={data?.bot?.connected ? "Connected" : "Needs auth"}
              detail={data?.bot?.configuredUsername ?? "Bot"}
              tone={data?.bot?.connected ? "good" : "warn"}
            />
          </div>
        </div>
      </section>

      {actionMessage ? (
        <div className="rounded-[24px] border border-emerald-400/50 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-[24px] border border-rose-400/50 bg-rose-500/10 p-4 text-sm text-rose-200">
          {actionError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={ShieldAlert}
          label="Recent request failures"
          value={String(recentFailures)}
        />
        <AdminMetric
          icon={ScrollText}
          label="Audit records shown"
          value={String(data?.audits?.length ?? 0)}
        />
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="min-w-0 self-start grid gap-6">
          <Card className="min-w-0 bg-(--panel)">
            <CardHeader>
              <CardTitle className="text-2xl">Bot account</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-start gap-4 rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-(--border) bg-(--bg-elevated) text-(--brand)">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-(--text)">
                    {data?.bot?.connected
                      ? `${data.bot.configuredUsername} is connected`
                      : `${data?.bot?.configuredUsername ?? "Bot account"} needs to be connected`}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-(--muted)">
                    Shared bot account.
                  </p>
                </div>
                {!data?.bot?.connected ? (
                  <Button asChild size="lg">
                    <a href="/auth/twitch/bot/start" className="no-underline">
                      Connect bot account
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-(--panel)">
            <CardHeader>
              <CardTitle className="text-2xl">Offline testing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
                <p className="text-lg font-semibold text-(--text)">
                  {data?.settings?.adminForceBotWhileOffline
                    ? "Offline bot testing is enabled"
                    : "Offline bot testing is disabled"}
                </p>
                <p className="mt-2 text-sm leading-6 text-(--muted)">
                  Keep chat active while offline.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => setOfflineTesting(true)}
                    disabled={
                      togglingOfflineTesting ||
                      !!data?.settings?.adminForceBotWhileOffline
                    }
                  >
                    {togglingOfflineTesting &&
                    !data?.settings?.adminForceBotWhileOffline
                      ? "Enabling..."
                      : "Enable offline testing"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOfflineTesting(false)}
                    disabled={
                      togglingOfflineTesting ||
                      !data?.settings?.adminForceBotWhileOffline
                    }
                  >
                    {togglingOfflineTesting &&
                    data?.settings?.adminForceBotWhileOffline
                      ? "Disabling..."
                      : "Disable offline testing"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-(--panel)">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-(--border) bg-(--panel-soft) text-(--brand)">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Design system</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: "Background", value: "var(--bg)" },
                  { label: "Panel", value: "var(--panel)" },
                  { label: "Brand", value: "var(--brand)" },
                  { label: "Accent", value: "var(--brand-deep)" },
                ].map((token, index) => (
                  <div
                    key={token.label}
                    className="rounded-[22px] border border-(--border) p-4"
                  >
                    <div
                      className="h-16 rounded-[18px] border border-(--border)"
                      style={{
                        background:
                          index === 0
                            ? "var(--bg)"
                            : index === 1
                              ? "var(--panel)"
                              : index === 2
                                ? "var(--brand)"
                                : "var(--brand-deep)",
                      }}
                    />
                    <p className="mt-3 text-sm font-medium text-(--text)">
                      {token.label}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-(--muted)">
                      {token.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--muted)">
                    Buttons + badges
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button size="lg">Primary action</Button>
                    <Button variant="outline" size="lg">
                      Secondary
                    </Button>
                    <Button variant="ghost" size="lg">
                      Ghost
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>Admin</Badge>
                    <Badge variant="secondary">Search result</Badge>
                    <Badge variant="outline">Neutral</Badge>
                  </div>
                </div>

                <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--muted)">
                    Inputs + selection
                  </p>
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="design-preview-search">
                        Search field
                      </Label>
                      <Input
                        id="design-preview-search"
                        defaultValue="Smashing Pumpkins"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Sort order</Label>
                      <Select defaultValue="relevance">
                        <SelectTrigger>
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relevance">Best match</SelectItem>
                          <SelectItem value="artist">Artist</SelectItem>
                          <SelectItem value="updated">
                            Recently updated
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-5">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-(--brand)" />
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--muted)">
                    Dense result row
                  </p>
                </div>
                <div className="mt-4 overflow-hidden rounded-[22px] border border-(--border)">
                  <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 bg-(--panel-muted) px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-(--muted)">
                    <span>Track</span>
                    <span>Album / Creator</span>
                    <span>Tuning / Path</span>
                    <span>Stats</span>
                    <span className="text-right">Copy</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 bg-(--panel-strong) px-4 py-4">
                    <div>
                      <p className="font-semibold text-(--text)">Cherub Rock</p>
                      <p className="mt-1 text-sm text-(--brand-deep)">
                        Smashing Pumpkins
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-(--text)">Siamese Dream</p>
                      <p className="mt-1 text-sm text-(--muted)">
                        Charted by ExampleUser
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-(--text)">Eb Standard</p>
                      <p className="mt-1 text-sm text-(--muted)">
                        Lead, Rhythm, Bass
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-(--text)">4:57</p>
                      <p className="mt-1 text-sm text-(--muted)">
                        12,904 downloads
                      </p>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--panel) text-(--brand)">
                        Copy
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 bg-(--panel-soft) px-4 py-4">
                    <div>
                      <p className="font-semibold text-(--text)">Mayonaise</p>
                      <p className="mt-1 text-sm text-(--brand-deep)">
                        Smashing Pumpkins
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-(--text)">Siamese Dream</p>
                      <p className="mt-1 text-sm text-(--muted)">
                        Charted by ExampleUser
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-(--text)">Eb Standard</p>
                      <p className="mt-1 text-sm text-(--muted)">
                        Lead, Rhythm
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-(--text)">6:55</p>
                      <p className="mt-1 text-sm text-(--muted)">
                        9,882 downloads
                      </p>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--panel) text-(--brand)">
                        Copy
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 self-start grid gap-6">
          <Card className="overflow-hidden bg-(--panel)">
            <CardHeader>
              <CardTitle className="text-2xl">Recent request logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[372px] overflow-y-auto pr-2">
                <div className="grid gap-3">
                  {data?.logs?.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-[22px] border border-(--border) bg-(--panel-soft) px-4 py-3"
                    >
                      <p className="font-medium text-(--text)">
                        {log.rawMessage}
                      </p>
                      <p className="mt-1 text-sm text-(--muted)">
                        {log.requesterDisplayName ??
                          log.requesterLogin ??
                          "Unknown"}{" "}
                        · {formatRequestOutcome(log)}
                      </p>
                      {formatMatchedSong(log) ? (
                        <p className="mt-1 text-sm text-(--brand-deep)">
                          Match: {formatMatchedSong(log)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden bg-(--panel)">
            <CardHeader>
              <CardTitle className="text-2xl">Recent audit logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[372px] overflow-y-auto pr-2">
                <div className="grid gap-3">
                  {data?.audits?.map((audit) => (
                    <div
                      key={audit.id}
                      className="rounded-[22px] border border-(--border) bg-(--panel-soft) px-4 py-3"
                    >
                      <p className="font-medium text-(--text)">
                        {audit.action}
                      </p>
                      <p className="mt-1 text-sm text-(--muted)">
                        {audit.entityType} ·{" "}
                        {new Date(audit.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function AdminStatusCard(props: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    props.tone === "good"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
      : props.tone === "warn"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
        : "border-(--border) bg-(--panel) text-(--text)";

  return (
    <div className={`rounded-[22px] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">
        {props.label}
      </p>
      <p className="mt-1 text-base font-semibold capitalize">{props.value}</p>
      <p className="mt-1 text-sm opacity-80">{props.detail}</p>
    </div>
  );
}

function AdminMetric(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[26px] border border-(--border) bg-(--panel) p-5 shadow-(--shadow-soft)">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-(--border) bg-(--panel-soft) text-(--brand)">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-(--muted)">{props.label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-(--text)">
        {props.value}
      </p>
    </div>
  );
}
