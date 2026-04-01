// Route: Renders the owner-only admin dashboard for app operations and status.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ScrollText, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { PlaylistQueueItemPreview } from "~/components/playlist-management-surface";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";

type RequestLogRow = {
  id: string;
  rawMessage: string;
  normalizedQuery?: string | null;
  outcome: string;
  requesterDisplayName?: string;
  requesterLogin?: string | null;
  outcomeReason?: string | null;
  matchedSongTitle?: string | null;
  matchedSongArtist?: string | null;
  createdAt?: number;
};

type AuditLogRow = {
  id: string;
  actorType?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payloadJson?: string | null;
  createdAt: number;
};

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
};

type RequestLogsPageData = {
  error?: string;
  logs: RequestLogRow[];
  total: number;
  issueCount: number;
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type AuditLogsPageData = {
  error?: string;
  audits: AuditLogRow[];
  total: number;
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

const ADMIN_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

async function fetchAdminBaseState() {
  const response = await fetch("/api/dashboard/admin");
  return response.json() as Promise<DashboardAdminData>;
}

async function fetchRequestLogsPage(offset: number, limit: number) {
  const response = await fetch(
    `/api/dashboard/logs?${new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    }).toString()}`
  );

  return response.json() as Promise<RequestLogsPageData>;
}

async function fetchAuditLogsPage(offset: number, limit: number) {
  const response = await fetch(
    `/api/dashboard/audits?${new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    }).toString()}`
  );

  return response.json() as Promise<AuditLogsPageData>;
}

export const Route = createFileRoute("/dashboard/admin")({
  head: async () => ({
    meta: [
      {
        title: await getLocalizedPageTitle({
          namespace: "admin",
          key: "page.title",
        }),
      },
    ],
  }),
  component: DashboardAdminPage,
});

function DashboardAdminPage() {
  const { t } = useLocaleTranslation("admin");
  const { locale } = useAppLocale();
  const queryClient = useQueryClient();
  const [togglingOfflineTesting, setTogglingOfflineTesting] = useState(false);
  const [updatingBotAuth, setUpdatingBotAuth] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [logsOffset, setLogsOffset] = useState(0);
  const [logsLimit, setLogsLimit] =
    useState<(typeof ADMIN_PAGE_SIZE_OPTIONS)[number]>(10);
  const [auditsOffset, setAuditsOffset] = useState(0);
  const [auditsLimit, setAuditsLimit] =
    useState<(typeof ADMIN_PAGE_SIZE_OPTIONS)[number]>(10);
  const { data, refetch } = useQuery<DashboardAdminData>({
    queryKey: ["dashboard-admin-base"],
    queryFn: fetchAdminBaseState,
    staleTime: 30_000,
  });
  const canLoadActivity = !!data && !data.error;
  const logsQuery = useQuery<RequestLogsPageData>({
    queryKey: ["dashboard-admin-logs", logsOffset, logsLimit],
    queryFn: () => fetchRequestLogsPage(logsOffset, logsLimit),
    enabled: canLoadActivity,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
  const auditsQuery = useQuery<AuditLogsPageData>({
    queryKey: ["dashboard-admin-audits", auditsOffset, auditsLimit],
    queryFn: () => fetchAuditLogsPage(auditsOffset, auditsLimit),
    enabled: canLoadActivity,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!logsQuery.data?.hasNext) {
      return;
    }

    void queryClient.prefetchQuery({
      queryKey: ["dashboard-admin-logs", logsOffset + logsLimit, logsLimit],
      queryFn: () => fetchRequestLogsPage(logsOffset + logsLimit, logsLimit),
      staleTime: 30_000,
    });
  }, [logsLimit, logsOffset, logsQuery.data?.hasNext, queryClient]);

  useEffect(() => {
    if (!auditsQuery.data?.hasNext) {
      return;
    }

    void queryClient.prefetchQuery({
      queryKey: [
        "dashboard-admin-audits",
        auditsOffset + auditsLimit,
        auditsLimit,
      ],
      queryFn: () =>
        fetchAuditLogsPage(auditsOffset + auditsLimit, auditsLimit),
      staleTime: 30_000,
    });
  }, [auditsLimit, auditsOffset, auditsQuery.data?.hasNext, queryClient]);

  useEffect(() => {
    if (logsQuery.data == null) {
      return;
    }

    if (logsQuery.data.total === 0) {
      if (logsOffset !== 0) {
        setLogsOffset(0);
      }
      return;
    }

    if (logsQuery.data.offset < logsQuery.data.total) {
      return;
    }

    setLogsOffset(
      Math.max(
        0,
        Math.floor((logsQuery.data.total - 1) / logsLimit) * logsLimit
      )
    );
  }, [logsLimit, logsOffset, logsQuery.data]);

  useEffect(() => {
    if (auditsQuery.data == null) {
      return;
    }

    if (auditsQuery.data.total === 0) {
      if (auditsOffset !== 0) {
        setAuditsOffset(0);
      }
      return;
    }

    if (auditsQuery.data.offset < auditsQuery.data.total) {
      return;
    }

    setAuditsOffset(
      Math.max(
        0,
        Math.floor((auditsQuery.data.total - 1) / auditsLimit) * auditsLimit
      )
    );
  }, [auditsLimit, auditsOffset, auditsQuery.data]);

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
        throw new Error(payload?.message ?? t("states.offlineTestingFailed"));
      }
      setActionMessage(
        payload?.warning
          ? `${payload.message ?? t("states.updated")} ${payload.warning}`
          : (payload?.message ?? t("states.updated"))
      );
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({
          queryKey: ["dashboard-admin-audits"],
        }),
      ]);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t("states.offlineTestingFailed")
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
      throw new Error(payload?.message ?? t("states.botUpdateFailed"));
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
        error instanceof Error ? error.message : t("states.botUpdateFailed")
      );
      setUpdatingBotAuth(false);
    }
  }

  if (data?.error) {
    return (
      <div className="grid gap-6">
        <DashboardPageHeader title={t("page.title")} />
        <div className="border border-(--border) bg-(--panel) p-5 text-sm text-(--muted)">
          {t("page.noAccess")}
        </div>
      </div>
    );
  }

  const recentFailures = logsQuery.data?.issueCount ?? 0;
  const logs = logsQuery.data?.logs ?? [];
  const audits = auditsQuery.data?.audits ?? [];
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
  const logsRangeLabel = getAdminRangeLabel(
    logsQuery.data?.total ?? 0,
    logsQuery.data?.offset ?? logsOffset,
    logs.length,
    t
  );
  const auditsRangeLabel = getAdminRangeLabel(
    auditsQuery.data?.total ?? 0,
    auditsQuery.data?.offset ?? auditsOffset,
    audits.length,
    t
  );
  const showPlaylistPrototype = import.meta.env.DEV;
  const requestLogColumns = useMemo(
    () => getRequestLogColumns(t, locale),
    [locale, t]
  );
  const auditLogColumns = useMemo(
    () => getAuditLogColumns(t, locale),
    [locale, t]
  );

  return (
    <div className="page-section-stack dashboard-admin grid gap-6">
      <DashboardPageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          !data?.bot?.connected ? (
            <>
              <div className="self-start border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {t("page.authNotice")}{" "}
                <span className="font-semibold">{configuredBotUsername}</span>
              </div>
              <Button asChild>
                <a href="/auth/twitch/bot/start" className="no-underline">
                  {t("actions.connectBot", { username: configuredBotUsername })}
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
                {updatingBotAuth
                  ? t("actions.reconnecting")
                  : t("actions.reconnectBot")}
              </Button>
            </div>
          )
        }
        aside={
          <div className="grid w-full min-w-0 gap-3 md:max-w-sm">
            <AdminStatusCard
              label={t("page.botAccount")}
              value={
                data?.bot?.connected
                  ? t("status.connected")
                  : t("status.needsAuth")
              }
              detail={connectedBotLabel}
              tone={data?.bot?.connected ? "good" : "warn"}
            />
            {botUsernameMismatch ? (
              <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm break-words text-amber-100">
                {t("page.botMismatch", {
                  connected: connectedBotLabel,
                  expected: configuredBotUsername,
                })}
              </div>
            ) : null}
          </div>
        }
      />

      {actionMessage ? (
        <div className="border border-emerald-400/50 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="border border-rose-400/50 bg-rose-500/10 p-4 text-sm text-rose-200">
          {actionError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminMetric
          icon={ShieldAlert}
          label={t("metrics.requestIssues.label")}
          value={String(recentFailures)}
          description={t("metrics.requestIssues.description")}
        />
        <AdminMetric
          icon={ScrollText}
          label={t("metrics.auditRows.label")}
          value={String(auditsQuery.data?.total ?? 0)}
          description={t("metrics.auditRows.description")}
        />
        <div className="border border-(--border) bg-(--panel) p-5 shadow-(--shadow-soft)">
          <div>
            <p className="text-sm text-(--muted)">
              {t("offlineTesting.title")}
            </p>
            <p
              className={`mt-2 text-xl font-semibold ${
                data?.settings?.adminForceBotWhileOffline
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {data?.settings?.adminForceBotWhileOffline
                ? t("status.enabled")
                : t("status.disabled")}
            </p>
          </div>
          <div className="dashboard-admin__offline-actions mt-4 flex flex-wrap gap-3">
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
                ? t("actions.enabling")
                : t("actions.enable")}
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
                ? t("actions.disabling")
                : t("actions.disable")}
            </Button>
          </div>
        </div>
      </section>

      {showPlaylistPrototype ? (
        <section className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-2xl font-semibold text-(--text)">
              {t("prototype.title")}
            </h2>
            <p className="text-sm text-(--muted)">
              {t("prototype.description")}
            </p>
          </div>
          <DevPlaylistPrototypeCard />
        </section>
      ) : null}

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-2xl font-semibold text-(--text)">
              {t("logs.title")}
            </h2>
            <p className="text-sm text-(--muted)">{t("logs.description")}</p>
          </div>
          <AdminPaginationControls
            total={logsQuery.data?.total ?? 0}
            offset={logsQuery.data?.offset ?? logsOffset}
            limit={logsQuery.data?.limit ?? logsLimit}
            rangeLabel={logsRangeLabel}
            hasPrevious={logsQuery.data?.hasPrevious ?? logsOffset > 0}
            hasNext={logsQuery.data?.hasNext ?? false}
            isFetching={logsQuery.isFetching}
            onPageSizeChange={(value) =>
              setLogsLimit(value as (typeof ADMIN_PAGE_SIZE_OPTIONS)[number])
            }
            onPrevious={() =>
              setLogsOffset((currentOffset) =>
                Math.max(0, currentOffset - logsLimit)
              )
            }
            onNext={() =>
              setLogsOffset((currentOffset) => currentOffset + logsLimit)
            }
          />
        </div>
        <AdminTable
          data={logs}
          columns={requestLogColumns}
          isLoading={logsQuery.isPending}
          loadingMessage={t("logs.loading")}
          emptyMessage={t("logs.empty")}
        />
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-2xl font-semibold text-(--text)">
              {t("audits.title")}
            </h2>
            <p className="text-sm text-(--muted)">{t("audits.description")}</p>
          </div>
          <AdminPaginationControls
            total={auditsQuery.data?.total ?? 0}
            offset={auditsQuery.data?.offset ?? auditsOffset}
            limit={auditsQuery.data?.limit ?? auditsLimit}
            rangeLabel={auditsRangeLabel}
            hasPrevious={auditsQuery.data?.hasPrevious ?? auditsOffset > 0}
            hasNext={auditsQuery.data?.hasNext ?? false}
            isFetching={auditsQuery.isFetching}
            onPageSizeChange={(value) =>
              setAuditsLimit(value as (typeof ADMIN_PAGE_SIZE_OPTIONS)[number])
            }
            onPrevious={() =>
              setAuditsOffset((currentOffset) =>
                Math.max(0, currentOffset - auditsLimit)
              )
            }
            onNext={() =>
              setAuditsOffset((currentOffset) => currentOffset + auditsLimit)
            }
          />
        </div>
        <AdminTable
          data={audits}
          columns={auditLogColumns}
          isLoading={auditsQuery.isPending}
          loadingMessage={t("audits.loading")}
          emptyMessage={t("audits.empty")}
        />
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
    <div
      className={`dashboard-admin__bot-card min-w-0 border px-4 py-3 ${toneClass}`}
    >
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
  description?: string;
}) {
  const Icon = props.icon;

  return (
    <div className="border border-(--border) bg-(--panel) p-5 shadow-(--shadow-soft)">
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 shrink-0 text-(--brand)" />
        <p className="text-sm font-medium text-(--text)">{props.label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-(--text)">
        {props.value}
      </p>
      {props.description ? (
        <p className="mt-2 text-sm leading-6 text-(--muted)">
          {props.description}
        </p>
      ) : null}
    </div>
  );
}

function DevPlaylistPrototypeCard() {
  const { t } = useLocaleTranslation("admin");

  return (
    <Card>
      <CardHeader className="grid gap-2">
        <CardTitle>{t("prototype.cardTitle")}</CardTitle>
        <p className="text-sm text-(--muted)">
          {t("prototype.cardDescription")}
        </p>
      </CardHeader>
      <CardContent>
        <PlaylistQueueItemPreview />
      </CardContent>
    </Card>
  );
}

function AdminPaginationControls(props: {
  total: number;
  offset: number;
  limit: number;
  rangeLabel: string;
  hasPrevious: boolean;
  hasNext: boolean;
  isFetching: boolean;
  onPageSizeChange: (value: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useLocaleTranslation("admin");

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-sm text-(--muted)">
        {props.rangeLabel}
        {props.isFetching ? ` ${t("pagination.updating")}` : ""}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
          {t("pagination.show")}
        </span>
        <Select
          value={String(props.limit)}
          disabled={props.isFetching}
          onValueChange={(value) => props.onPageSizeChange(Number(value))}
        >
          <SelectTrigger className="h-10 w-[5.5rem] px-3 py-2 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_PAGE_SIZE_OPTIONS.map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3 py-2"
          disabled={props.isFetching || !props.hasPrevious}
          onClick={props.onPrevious}
        >
          {t("pagination.previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3 py-2"
          disabled={props.isFetching || !props.hasNext}
          onClick={props.onNext}
        >
          {t("pagination.next")}
        </Button>
      </div>
    </div>
  );
}

function AdminTable<TData>(props: {
  data: TData[];
  columns: ColumnDef<TData>[];
  isLoading?: boolean;
  loadingMessage?: string;
  emptyMessage: string;
}) {
  const { t } = useLocaleTranslation("admin");
  const table = useReactTable({
    data: props.data,
    columns: props.columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (props.isLoading && props.data.length === 0) {
    return (
      <div className="border border-(--border) bg-(--panel-soft) px-5 py-4 text-sm text-(--muted)">
        {props.loadingMessage ?? t("table.loading")}
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="border border-(--border) bg-(--panel-soft) px-5 py-4 text-sm text-(--muted)">
        {props.emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-(--border)">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-(--panel-soft)">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-(--border)">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => (
            <tr
              key={row.id}
              className={`border-b border-(--border) align-top ${
                index % 2 === 0 ? "bg-(--panel)" : "bg-(--panel-soft)"
              }`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getRequestLogColumns(
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): ColumnDef<RequestLogRow>[] {
  return [
    {
      header: t("requestLog.columns.time"),
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <div className="min-w-[10rem] text-xs text-(--muted)">
          {formatAdminTimestamp(row.original.createdAt, locale, t)}
        </div>
      ),
    },
    {
      header: t("requestLog.columns.request"),
      accessorKey: "rawMessage",
      cell: ({ row }) => (
        <div className="grid gap-1 min-w-[18rem]">
          <p className="font-medium text-(--text)">{row.original.rawMessage}</p>
          {row.original.normalizedQuery &&
          row.original.normalizedQuery !== row.original.rawMessage ? (
            <p className="text-xs text-(--muted)">
              {t("requestLog.query", { query: row.original.normalizedQuery })}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      header: t("requestLog.columns.requester"),
      id: "requester",
      cell: ({ row }) => {
        const requesterLabel =
          row.original.requesterDisplayName ??
          row.original.requesterLogin ??
          t("requestLog.unknownUser");

        return (
          <div className="min-w-[10rem]">
            <p className="font-medium text-(--text)">{requesterLabel}</p>
            {row.original.requesterLogin &&
            row.original.requesterDisplayName &&
            row.original.requesterLogin !==
              row.original.requesterDisplayName ? (
              <p className="text-xs text-(--muted)">
                @{row.original.requesterLogin}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      header: t("requestLog.columns.result"),
      accessorKey: "outcome",
      cell: ({ row }) => <OutcomeBadge outcome={row.original.outcome} />,
    },
    {
      header: t("requestLog.columns.details"),
      id: "details",
      cell: ({ row }) => (
        <div className="grid min-w-[18rem] gap-1">
          {row.original.matchedSongTitle ? (
            <p className="text-(--text)">
              {t("requestLog.matched", {
                title: row.original.matchedSongTitle,
                artist: row.original.matchedSongArtist
                  ? ` - ${row.original.matchedSongArtist}`
                  : "",
              })}
            </p>
          ) : null}
          {row.original.outcomeReason ? (
            <p className="text-(--muted)">
              {t("requestLog.reason", { reason: row.original.outcomeReason })}
            </p>
          ) : !row.original.matchedSongTitle ? (
            <p className="text-(--muted)">{t("requestLog.noMatchOrReason")}</p>
          ) : null}
        </div>
      ),
    },
  ];
}

function getAuditLogColumns(
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
): ColumnDef<AuditLogRow>[] {
  return [
    {
      header: t("auditLog.columns.time"),
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <div className="min-w-[10rem] text-xs text-(--muted)">
          {formatAdminTimestamp(row.original.createdAt, locale, t)}
        </div>
      ),
    },
    {
      header: t("auditLog.columns.action"),
      accessorKey: "action",
      cell: ({ row }) => (
        <div className="min-w-[14rem]">
          <p className="font-medium text-(--text)">
            {formatAdminLabel(row.original.action, t)}
          </p>
        </div>
      ),
    },
    {
      header: t("auditLog.columns.entity"),
      id: "entity",
      cell: ({ row }) => (
        <div className="min-w-[12rem]">
          <p className="font-medium text-(--text)">
            {formatAdminLabel(row.original.entityType, t)}
          </p>
          {row.original.entityId ? (
            <p className="text-xs text-(--muted)">{row.original.entityId}</p>
          ) : null}
        </div>
      ),
    },
    {
      header: t("auditLog.columns.actor"),
      id: "actor",
      cell: ({ row }) => (
        <div className="min-w-[10rem]">
          <p className="font-medium text-(--text)">
            {formatAdminLabel(row.original.actorType ?? "system", t)}
          </p>
          {row.original.actorUserId ? (
            <p className="text-xs text-(--muted)">{row.original.actorUserId}</p>
          ) : null}
        </div>
      ),
    },
    {
      header: t("auditLog.columns.details"),
      id: "details",
      cell: ({ row }) => (
        <div className="min-w-[18rem] text-(--muted)">
          {summarizeAuditPayload(row.original.payloadJson, t) ??
            t("table.noExtraValues")}
        </div>
      ),
    },
  ];
}

function OutcomeBadge(props: { outcome: string }) {
  const { t } = useLocaleTranslation("admin");
  const label = formatAdminLabel(props.outcome, t);
  const toneClass =
    props.outcome === "accepted"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : props.outcome === "blocked"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
        : props.outcome === "error"
          ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
          : "border-(--border-strong) bg-(--panel-muted) text-(--text)";

  return (
    <span
      className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function getAdminRangeLabel(
  total: number,
  offset: number,
  rowCount: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (total === 0 || rowCount === 0) {
    return t("pagination.showingEmpty");
  }

  const start = offset + 1;
  const end = offset + rowCount;
  return t("pagination.showingRange", { start, end, total });
}

function formatAdminTimestamp(
  value: number | undefined | null,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : t("table.unknownTime");
}

function formatAdminLabel(
  value: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`labels.${value}`, {
    defaultValue: value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (match) => match.toUpperCase()),
  });
}

function summarizeAuditPayload(
  payloadJson: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!payloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return String(parsed);
    }

    const preferredKeys = [
      "source",
      "grantedTokenCount",
      "enabled",
      "amount",
      "bits",
      "viewers",
      "minimumRaidViewerCount",
      "totalGiftedSubs",
      "requestKind",
      "songTitle",
      "songArtist",
      "artistName",
      "charterName",
      "viewerLogin",
      "login",
      "displayName",
    ];

    const entries = Object.entries(parsed as Record<string, unknown>);
    const prioritized = [
      ...preferredKeys
        .map((key) => entries.find(([entryKey]) => entryKey === key))
        .filter((entry): entry is [string, unknown] => !!entry),
      ...entries.filter(
        ([key]) =>
          !preferredKeys.includes(key) &&
          isScalarAuditValue(parsed[key as keyof typeof parsed])
      ),
    ];

    const summary = prioritized
      .filter((entry): entry is [string, string | number | boolean | null] =>
        isScalarAuditValue(entry[1])
      )
      .slice(0, 3)
      .map(
        ([key, value]) =>
          `${formatAdminLabel(key, t)}: ${formatAuditValue(key, value, t)}`
      )
      .join(" • ");

    return summary || null;
  } catch {
    return payloadJson;
  }
}

const auditSourceLabelKeys: Record<string, string> = {
  "channel.cheer": "channelCheer",
  "channel.raid": "channelRaid",
  "channel.subscribe": "channelSubscribe",
  "channel.subscription.gift": "channelSubscriptionGift",
  "channel.subscription.message": "channelSubscriptionMessage",
  "streamelements.tip": "streamElementsTip",
};

function formatAuditValue(
  key: string,
  value: string | number | boolean | null,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (value == null) {
    return t("table.none");
  }

  if (key === "source" && typeof value === "string") {
    const sourceKey = auditSourceLabelKeys[value];
    return sourceKey
      ? t(`auditSources.${sourceKey}`, { defaultValue: value })
      : value;
  }

  if (typeof value === "boolean") {
    return value ? t("table.yes") : t("table.no");
  }

  return String(value);
}

function isScalarAuditValue(value: unknown) {
  return (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
