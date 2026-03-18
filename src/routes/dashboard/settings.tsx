// Route: Renders request behavior and channel configuration settings.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { getBotStatusLabel, getBotStatusMessage } from "~/lib/bot-status";
import { pathOptions, tuningOptions } from "~/lib/channel-options";
import { pageTitle } from "~/lib/page-title";
import { getErrorMessage } from "~/lib/utils";
import type { SettingsInputData } from "~/lib/validation";

type DashboardSettingsFormData = Omit<
  SettingsInputData,
  "allowedTunings" | "requiredPaths"
> & {
  allowedTunings: string[];
  requiredPaths: string[];
};

type DashboardSettingsData = {
  channel: {
    isLive: boolean;
    botEnabled: boolean;
    botReadyState: string;
  };
  settings: DashboardSettingsFormData | null;
  bot: {
    connected: boolean;
    configuredUsername: string;
  };
};

const defaultForm: DashboardSettingsFormData = {
  botChannelEnabled: false,
  moderatorCanManageRequests: false,
  moderatorCanManageBlacklist: false,
  moderatorCanManageSetlist: false,
  moderatorCanManageVipTokens: false,
  moderatorCanManageTags: false,
  requestsEnabled: true,
  allowAnyoneToRequest: true,
  allowSubscribersToRequest: true,
  allowVipsToRequest: true,
  onlyOfficialDlc: false,
  allowedTunings: [],
  requiredPaths: [],
  publicPlaylistEnabled: true,
  maxQueueSize: 250,
  maxViewerRequestsAtOnce: 1,
  maxSubscriberRequestsAtOnce: 1,
  maxVipViewerRequestsAtOnce: 1,
  maxVipSubscriberRequestsAtOnce: 1,
  limitRegularRequestsEnabled: false,
  regularRequestsPerPeriod: 1,
  regularRequestPeriodSeconds: 0,
  limitVipRequestsEnabled: false,
  vipRequestsPerPeriod: 1,
  vipRequestPeriodSeconds: 0,
  blacklistEnabled: false,
  letSetlistBypassBlacklist: false,
  setlistEnabled: false,
  subscribersMustFollowSetlist: false,
  autoGrantVipTokenToSubscribers: false,
  duplicateWindowSeconds: 900,
  commandPrefix: "!sr",
};

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [{ title: pageTitle("Settings") }],
  }),
  component: DashboardSettingsPage,
});

function DashboardSettingsPage() {
  const queryClient = useQueryClient();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const settingsQuery = useQuery({
    queryKey: ["dashboard-settings"],
    queryFn: async (): Promise<DashboardSettingsData> => {
      const response = await fetch("/api/dashboard/settings");
      const body = (await response.json().catch(() => null)) as
        | DashboardSettingsData
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? "Failed to load settings.")
            : "Failed to load settings."
        );
      }

      return body as DashboardSettingsData;
    },
  });
  const [form, setForm] = useState<DashboardSettingsFormData>(defaultForm);

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setForm(settingsQuery.data.settings);
    }
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/dashboard/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(form as SettingsInputData),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            message?: string;
            warning?: string | null;
          }
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? "Settings could not be saved.")
            : "Settings could not be saved."
        );
      }

      return body as {
        message?: string;
        warning?: string | null;
      };
    },
    onMutate: () => {
      setSaveMessage(null);
      setSaveWarning(null);
      setSaveError(null);
    },
    onSuccess: async (payload) => {
      setSaveMessage(payload?.message ?? "Settings saved.");
      setSaveWarning(payload?.warning ?? null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }),
      ]);
    },
    onError: (error) => {
      setSaveError(getErrorMessage(error) || "Settings could not be saved.");
    },
  });

  const status = settingsQuery.data?.channel?.botReadyState ?? "disabled";
  const statusMessage = getBotStatusMessage(status);

  function toggleArrayValue(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value];
  }

  function setBoolean<K extends keyof DashboardSettingsFormData>(
    key: K,
    value: boolean
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "allowAnyoneToRequest" && value) {
        next.allowSubscribersToRequest = true;
        next.allowVipsToRequest = true;
      }

      return next;
    });
  }

  function setNumber<K extends keyof DashboardSettingsFormData>(
    key: K,
    value: number
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-6">
      <section className="surface-grid surface-noise rounded-[34px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow) md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--brand-deep)">
              Channel settings
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-(--text)">
              Settings
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={status === "active" ? "default" : "outline"}>
              {getBotStatusLabel(status)}
            </Badge>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </div>
      </section>

      {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}
      {saveWarning ? <Banner tone="warning">{saveWarning}</Banner> : null}
      {saveError ? <Banner tone="danger">{saveError}</Banner> : null}

      <Card>
        <CardHeader>
          <CardTitle>Primary controls</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ToggleRow
            label="Enable playlist on your channel"
            description="The bot joins while you are live."
            checked={form.botChannelEnabled}
            onChange={(value) => setBoolean("botChannelEnabled", value)}
          />
          <ToggleRow
            label="Enable requests"
            description="Allow requests."
            checked={form.requestsEnabled}
            onChange={(value) => setBoolean("requestsEnabled", value)}
          />
          <ToggleRow
            label="Public playlist enabled"
            description="Show your playlist page."
            checked={form.publicPlaylistEnabled}
            onChange={(value) => setBoolean("publicPlaylistEnabled", value)}
          />
          <ToggleRow
            label="Auto grant one VIP token to subscribers"
            description="Give subscribers one token."
            checked={form.autoGrantVipTokenToSubscribers}
            onChange={(value) =>
              setBoolean("autoGrantVipTokenToSubscribers", value)
            }
          />
          <FormField label="Command prefix" description="Usually !sr">
            <Input
              value={form.commandPrefix}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  commandPrefix: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField
            label="Duplicate cooldown (seconds)"
            description="Time before the same song can be requested again."
          >
            <Input
              type="number"
              min={0}
              max={86400}
              value={form.duplicateWindowSeconds}
              onChange={(event) =>
                setNumber(
                  "duplicateWindowSeconds",
                  Number(event.target.value) || 0
                )
              }
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who can request</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <ToggleRow
            label="Allow anyone to request"
            description="All viewers"
            checked={form.allowAnyoneToRequest}
            onChange={(value) => setBoolean("allowAnyoneToRequest", value)}
          />
          <ToggleRow
            label="Allow subscribers to request"
            description="Subscribers"
            checked={
              form.allowAnyoneToRequest ? true : form.allowSubscribersToRequest
            }
            onChange={(value) => setBoolean("allowSubscribersToRequest", value)}
            disabled={form.allowAnyoneToRequest}
          />
          <ToggleRow
            label="Allow channel VIPs to request"
            description="VIPs"
            checked={form.allowAnyoneToRequest ? true : form.allowVipsToRequest}
            onChange={(value) => setBoolean("allowVipsToRequest", value)}
            disabled={form.allowAnyoneToRequest}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DLC restrictions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ToggleRow
            label="Only allow official DLC"
            description="Official only"
            checked={form.onlyOfficialDlc}
            onChange={(value) => setBoolean("onlyOfficialDlc", value)}
          />
          <MultiSelectGrid
            title="Allowed tunings"
            options={tuningOptions}
            selected={form.allowedTunings}
            onToggle={(value) =>
              setForm((current) => ({
                ...current,
                allowedTunings: toggleArrayValue(current.allowedTunings, value),
              }))
            }
          />
          <MultiSelectGrid
            title="Required paths"
            options={pathOptions}
            selected={form.requiredPaths}
            onToggle={(value) =>
              setForm((current) => ({
                ...current,
                requiredPaths: toggleArrayValue(current.requiredPaths, value),
              }))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue and rate limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <NumberField
              label="Maximum playlist size"
              value={form.maxQueueSize}
              onChange={(value) => setNumber("maxQueueSize", value)}
            />
            <NumberField
              label="Max requests per viewer"
              value={form.maxViewerRequestsAtOnce}
              onChange={(value) => setNumber("maxViewerRequestsAtOnce", value)}
            />
            <NumberField
              label="Max requests per subscriber"
              value={form.maxSubscriberRequestsAtOnce}
              onChange={(value) =>
                setNumber("maxSubscriberRequestsAtOnce", value)
              }
            />
            <NumberField
              label="Max VIP requests per viewer"
              value={form.maxVipViewerRequestsAtOnce}
              onChange={(value) =>
                setNumber("maxVipViewerRequestsAtOnce", value)
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <RateLimitCard
              title="Regular request rate limit"
              enabled={form.limitRegularRequestsEnabled}
              onToggle={(value) =>
                setBoolean("limitRegularRequestsEnabled", value)
              }
            >
              <NumberField
                label="Regular requests allowed"
                value={form.regularRequestsPerPeriod}
                onChange={(value) =>
                  setNumber("regularRequestsPerPeriod", value)
                }
              />
              <NumberField
                label="Regular period in seconds"
                value={form.regularRequestPeriodSeconds}
                onChange={(value) =>
                  setNumber("regularRequestPeriodSeconds", value)
                }
              />
            </RateLimitCard>
            <RateLimitCard
              title="VIP request rate limit"
              enabled={form.limitVipRequestsEnabled}
              onToggle={(value) => setBoolean("limitVipRequestsEnabled", value)}
            >
              <NumberField
                label="VIP requests allowed"
                value={form.vipRequestsPerPeriod}
                onChange={(value) => setNumber("vipRequestsPerPeriod", value)}
              />
              <NumberField
                label="VIP period in seconds"
                value={form.vipRequestPeriodSeconds}
                onChange={(value) =>
                  setNumber("vipRequestPeriodSeconds", value)
                }
              />
              <NumberField
                label="Max VIP requests per subscriber"
                value={form.maxVipSubscriberRequestsAtOnce}
                onChange={(value) =>
                  setNumber("maxVipSubscriberRequestsAtOnce", value)
                }
              />
            </RateLimitCard>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtering</CardTitle>
          <CardDescription>Use the Moderation page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ToggleRow
            label="Enable blacklist"
            description="Blacklist"
            checked={form.blacklistEnabled}
            onChange={(value) => setBoolean("blacklistEnabled", value)}
          />
          <ToggleRow
            label="Let setlist bypass blacklist"
            description="Setlist can override"
            checked={form.letSetlistBypassBlacklist}
            onChange={(value) => setBoolean("letSetlistBypassBlacklist", value)}
          />
          <ToggleRow
            label="Enable setlist"
            description="Setlist"
            checked={form.setlistEnabled}
            onChange={(value) => setBoolean("setlistEnabled", value)}
          />
          <ToggleRow
            label="Subscribers must follow setlist"
            description="Apply to subscribers"
            checked={form.subscribersMustFollowSetlist}
            onChange={(value) =>
              setBoolean("subscribersMustFollowSetlist", value)
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderator permissions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ToggleRow
            label="Requests"
            description="Manage requests"
            checked={form.moderatorCanManageRequests}
            onChange={(value) =>
              setBoolean("moderatorCanManageRequests", value)
            }
          />
          <ToggleRow
            label="Blacklist"
            description="Manage blacklist"
            checked={form.moderatorCanManageBlacklist}
            onChange={(value) =>
              setBoolean("moderatorCanManageBlacklist", value)
            }
          />
          <ToggleRow
            label="Setlist"
            description="Manage setlist"
            checked={form.moderatorCanManageSetlist}
            onChange={(value) => setBoolean("moderatorCanManageSetlist", value)}
          />
          <ToggleRow
            label="VIP tokens"
            description="Manage VIP tokens"
            checked={form.moderatorCanManageVipTokens}
            onChange={(value) =>
              setBoolean("moderatorCanManageVipTokens", value)
            }
          />
          <ToggleRow
            label="Tags"
            description="Not in use"
            checked={form.moderatorCanManageTags}
            onChange={(value) => setBoolean("moderatorCanManageTags", value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bot status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <StatusField
            label="You are live"
            value={settingsQuery.data?.channel?.isLive ? "Yes" : "No"}
          />
          <StatusField
            label="Bot connected"
            value={
              settingsQuery.data?.bot?.connected
                ? `Yes (${settingsQuery.data.bot.configuredUsername})`
                : "No"
            }
          />
          <StatusField
            label="Chat replies active"
            value={settingsQuery.data?.channel?.botEnabled ? "Yes" : "No"}
          />
          <StatusField
            label="Current state"
            value={getBotStatusLabel(status)}
          />
          <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-4 md:col-span-2">
            <p className="text-sm uppercase tracking-[0.16em] text-(--muted)">
              Status
            </p>
            <p className="mt-3 font-medium leading-7 text-(--text)">
              {statusMessage}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Banner(props: {
  tone: "success" | "warning" | "danger";
  children: string;
}) {
  const toneClass =
    props.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : props.tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <div className={`rounded-[24px] border p-4 text-sm ${toneClass}`}>
      {props.children}
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4 ${props.disabled ? "opacity-60" : ""}`}
    >
      <div>
        <p className="font-medium text-(--text)">{props.label}</p>
        <p className="mt-1 text-sm leading-7 text-(--muted)">
          {props.description}
        </p>
      </div>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        disabled={props.disabled}
        className="mt-1 h-5 w-5"
      />
    </label>
  );
}

function FormField(props: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <p className="font-medium text-(--text)">{props.label}</p>
      <p className="mt-1 text-sm leading-7 text-(--muted)">
        {props.description}
      </p>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <p className="font-medium text-(--text)">{props.label}</p>
      <Input
        type="number"
        min={0}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value) || 0)}
      />
    </div>
  );
}

function MultiSelectGrid(props: {
  title: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <p className="font-medium text-(--text)">{props.title}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {props.options.map((option) => (
          <label
            key={option}
            className="flex items-center gap-3 rounded-[20px] border border-(--border) bg-(--panel-muted) px-4 py-3"
          >
            <input
              type="checkbox"
              checked={props.selected.includes(option)}
              onChange={() => props.onToggle(option)}
            />
            <span className="text-sm text-(--text)">{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RateLimitCard(props: {
  title: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <ToggleRow
        label={props.title}
        description="Time-based limit"
        checked={props.enabled}
        onChange={props.onToggle}
      />
      {props.children}
    </div>
  );
}

function StatusField(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <p className="text-sm uppercase tracking-[0.16em] text-(--muted)">
        {props.label}
      </p>
      <p className="mt-3 font-medium text-(--text)">{props.value}</p>
    </div>
  );
}
