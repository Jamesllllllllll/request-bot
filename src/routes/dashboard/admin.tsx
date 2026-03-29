// Route: Renders the owner-only admin dashboard for app operations and status.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { pageTitle } from "~/lib/page-title";

type DashboardAdminData = {
  error?: string;
  bot?: {
    connected: boolean;
    configuredUsername: string;
    connectedLogin?: string | null;
    connectedDisplayName?: string | null;
    connectedUserId?: string | null;
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

function DashboardAdminPage() {
  const [togglingOfflineTesting, setTogglingOfflineTesting] = useState(false);
  const [updatingBotAuth, setUpdatingBotAuth] = useState(false);
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

  async function requestBotDisconnect() {
    const response = await fetch("/api/dashboard/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "disconnectBot",
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? "Bot account could not be updated.");
    }

    return payload;
  }

  async function reconnectBot() {
    if (!data?.bot?.connected) {
      window.location.href = "/auth/twitch/bot/start";
      return;
    }

    setUpdatingBotAuth(true);
    setActionMessage(null);
    setActionError(null);
    try {
      await requestBotDisconnect();
      window.location.href = "/auth/twitch/bot/start";
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Bot account could not be updated."
      );
      setUpdatingBotAuth(false);
    }
  }

  if (data?.error) {
    return (
      <div className="grid gap-6">
        <DashboardPageHeader title="Admin" />
        <div className="rounded-[24px] border border-(--border) bg-(--panel) p-5 text-sm text-(--muted)">
          You do not have access to the admin dashboard.
        </div>
      </div>
    );
  }

  const recentFailures = (data?.logs ?? []).filter(
    (log) => log.outcome !== "accepted"
  ).length;
  const logs = [...(data?.logs ?? [])].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
  );
  const configuredBotUsername = data?.bot?.configuredUsername ?? "bot account";
  const connectedBotLabel =
    data?.bot?.connectedDisplayName ??
    data?.bot?.connectedLogin ??
    data?.bot?.connectedUserId ??
    configuredBotUsername;
  const botUsernameMismatch =
    !!data?.bot?.connected &&
    !!data?.bot?.connectedLogin &&
    data.bot.connectedLogin.toLowerCase() !==
      configuredBotUsername.toLowerCase();

  return (
    <div className="page-section-stack dashboard-admin grid gap-6">
      <DashboardPageHeader
        title="Admin"
        description="Manage shared bot access and offline testing controls."
        actions={
          !data?.bot?.connected ? (
            <>
              <div className="self-start rounded-[20px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Complete Twitch auth as{" "}
                <span className="font-semibold">{configuredBotUsername}</span>
              </div>
              <Button asChild>
                <a href="/auth/twitch/bot/start" className="no-underline">
                  {`Connect ${configuredBotUsername}`}
                </a>
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void reconnectBot()}
                disabled={updatingBotAuth}
              >
                {updatingBotAuth ? "Reconnecting..." : "Reconnect bot"}
              </Button>
            </div>
          )
        }
        aside={
          <div className="grid w-full min-w-0 gap-3 md:max-w-sm">
            <AdminStatusCard
              label="Bot account"
              value={data?.bot?.connected ? "Connected" : "Needs auth"}
              detail={connectedBotLabel}
              tone={data?.bot?.connected ? "good" : "warn"}
            />
            {botUsernameMismatch ? (
              <div className="rounded-[20px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 break-words">
                Connected as{" "}
                <span className="font-semibold">{connectedBotLabel}</span>.
                Expected{" "}
                <span className="font-semibold">{configuredBotUsername}</span>.
                Reconnect to switch accounts.
              </div>
            ) : null}
          </div>
        }
      />

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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <Card className="bg-(--panel)">
          <CardContent className="grid gap-4 p-5">
            <div>
              <p className="text-sm text-(--muted)">Offline testing</p>
              <p className="mt-2 text-xl font-semibold text-(--text)">
                {data?.settings?.adminForceBotWhileOffline
                  ? "Enabled"
                  : "Disabled"}
              </p>
              <p className="mt-2 text-sm leading-6 text-(--muted)">
                Keep chat active while offline.
              </p>
            </div>
            <div className="dashboard-admin__offline-actions flex flex-wrap gap-3">
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
                  : "Enable"}
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
                  : "Disable"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-(--text)">Logs</h2>
        </div>
        <div className="grid gap-3">
          {logs.map((log) => {
            const requesterLabel =
              log.requesterDisplayName ?? log.requesterLogin ?? "Unknown user";

            return (
              <div
                key={log.id}
                className="rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-(--text)">{log.rawMessage}</p>
                  <p className="text-sm text-(--muted)">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString()
                      : "Unknown time"}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--muted)">
                  <span>{requesterLabel}</span>
                  <span>{log.outcome}</span>
                  {log.matchedSongTitle ? (
                    <span>
                      {log.matchedSongTitle}
                      {log.matchedSongArtist
                        ? ` - ${log.matchedSongArtist}`
                        : ""}
                    </span>
                  ) : null}
                  {log.outcomeReason ? <span>{log.outcomeReason}</span> : null}
                </div>
              </div>
            );
          })}
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4 text-sm text-(--muted)">
              No logs yet.
            </div>
          ) : null}
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
    <div className={`min-w-0 rounded-[22px] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">
        {props.label}
      </p>
      <p className="mt-1 text-base font-semibold capitalize">{props.value}</p>
      <p className="mt-1 break-words text-sm opacity-80">{props.detail}</p>
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
