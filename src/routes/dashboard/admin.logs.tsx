// Route: Renders request and moderation logs for the active dashboard channel.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { pageTitle } from "~/lib/page-title";

type DashboardLogsData = {
  error?: string;
  channel?: {
    id: string;
    login: string;
    displayName: string;
  };
  logs?: Array<{
    id: string;
    rawMessage: string;
    outcome: string;
    requesterLogin?: string | null;
    requesterDisplayName?: string | null;
    createdAt: number;
  }>;
};

export const Route = createFileRoute("/dashboard/admin/logs")({
  head: () => ({
    meta: [{ title: pageTitle("Admin Logs") }],
  }),
  component: DashboardLogsPage,
});

function DashboardLogsPage() {
  const { data } = useQuery<DashboardLogsData>({
    queryKey: ["dashboard-logs"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/logs");
      return response.json() as Promise<DashboardLogsData>;
    },
  });
  const logs = useMemo(
    () =>
      [...(data?.logs ?? [])].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
      ),
    [data?.logs]
  );

  return (
    <div>
      <h1 className="text-3xl font-semibold">Logs</h1>
      {data?.error ? (
        <div className="mt-6 rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4 text-sm text-(--muted)">
          You do not have access to these logs.
        </div>
      ) : null}
      <div className="mt-6 grid gap-3">
        {logs.map((log) => {
          const isOwnerRequest =
            !!data?.channel?.login &&
            log.requesterLogin?.toLowerCase() ===
              data.channel.login.toLowerCase();
          const requesterLabel = isOwnerRequest
            ? "You"
            : (log.requesterDisplayName ??
              log.requesterLogin ??
              "Unknown user");

          return (
            <div
              key={log.id}
              className="rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="font-medium text-(--text)">{log.rawMessage}</p>
                <p className="text-sm text-(--muted)">
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--muted)">
                <span>{requesterLabel}</span>
                <span>{log.outcome}</span>
              </div>
            </div>
          );
        })}
        {!data?.error && logs.length === 0 ? (
          <div className="rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4 text-sm text-(--muted)">
            No logs yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
