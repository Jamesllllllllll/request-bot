// Route: Renders request behavior and channel configuration settings.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { OverlaySettingsPanel } from "~/components/overlay-settings-panel";
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
import { getBotStatusLabel } from "~/lib/bot-status";
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

type ViewerSessionData = {
  viewer: null | {
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
};

const defaultForm: DashboardSettingsFormData = {
  botChannelEnabled: false,
  moderatorCanManageRequests: false,
  moderatorCanManageBlacklist: false,
  moderatorCanManageSetlist: false,
  moderatorCanManageBlockedChatters: false,
  moderatorCanViewVipTokens: false,
  moderatorCanManageVipTokens: false,
  moderatorCanManageTags: false,
  requestsEnabled: true,
  allowAnyoneToRequest: true,
  allowSubscribersToRequest: true,
  allowVipsToRequest: true,
  onlyOfficialDlc: false,
  allowedTunings: [],
  requiredPaths: [],
  requiredPathsMatchMode: "any",
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
  autoGrantVipTokensToSubGifters: false,
  autoGrantVipTokensToGiftRecipients: false,
  autoGrantVipTokensForCheers: false,
  cheerBitsPerVipToken: 200,
  cheerMinimumTokenPercent: 25,
  duplicateWindowSeconds: 900,
  commandPrefix: "!sr",
};

const twitchExtensionInstallUrl =
  "https://dashboard.twitch.tv/extensions/gojrfj73vbfx7fww479a77kpvyrz91-0.0.1";

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
  const sessionQuery = useQuery<ViewerSessionData>({
    queryKey: ["viewer-session"],
    queryFn: async () => {
      const response = await fetch("/api/session", {
        credentials: "include",
      });
      return response.json() as Promise<ViewerSessionData>;
    },
  });
  const hasOwnerChannel = !!sessionQuery.data?.viewer?.channel;
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
    enabled: !sessionQuery.isLoading && hasOwnerChannel,
  });
  const [form, setForm] = useState<DashboardSettingsFormData>(defaultForm);

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setForm({
        ...settingsQuery.data.settings,
        autoGrantVipTokenToSubscribers: false,
      });
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
  const manageableChannels =
    sessionQuery.data?.viewer?.manageableChannels
      ?.slice()
      .sort(
        (left, right) =>
          Number(right.isLive) - Number(left.isLive) ||
          left.displayName.localeCompare(right.displayName)
      ) ?? [];

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

      if (key === "moderatorCanManageVipTokens" && value) {
        next.moderatorCanViewVipTokens = true;
      }

      if (key === "moderatorCanViewVipTokens" && !value) {
        next.moderatorCanManageVipTokens = false;
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
    <div className="dashboard-settings grid gap-6">
      <DashboardPageHeader
        title="Settings"
        description="Owner-only channel configuration. Moderators use the channel page for playlist and moderation actions."
        meta={
          hasOwnerChannel ? (
            <p className="max-w-2xl text-sm leading-7 text-(--muted)">
              Beta testers can install the Twitch extension panel on Twitch.
            </p>
          ) : null
        }
        actions={
          hasOwnerChannel ? (
            <Button asChild variant="outline">
              <a
                href={twitchExtensionInstallUrl}
                target="_blank"
                rel="noreferrer"
                className="no-underline"
              >
                Install Twitch extension beta
              </a>
            </Button>
          ) : null
        }
        aside={
          hasOwnerChannel ? (
            <div className="flex flex-wrap items-center gap-3">
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
          ) : null
        }
      />

      {sessionQuery.isLoading ? (
        <Card className="dashboard-settings__section">
          <CardContent className="pt-6">
            <p className="text-sm text-(--muted)">Loading settings access...</p>
          </CardContent>
        </Card>
      ) : null}

      {!sessionQuery.isLoading && !hasOwnerChannel ? (
        <Card className="dashboard-settings__section">
          <CardHeader>
            <CardTitle>Owner settings only</CardTitle>
            <CardDescription>
              This area is only available for channels you own. Use the channel
              page for moderation work on channels you manage.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {manageableChannels.length ? (
              manageableChannels.map((channel) => (
                <div
                  key={channel.slug}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-(--border) bg-(--panel-soft) px-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-(--text)">
                      {channel.displayName}
                    </p>
                    <p className="mt-1 text-sm text-(--muted)">
                      @{channel.login}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <a href={`/${channel.slug}`} className="no-underline">
                      Open channel page
                    </a>
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-(--muted)">
                Sign in with a streamer account that owns a channel to manage
                owner settings here.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!sessionQuery.isLoading && hasOwnerChannel && settingsQuery.error ? (
        <Banner tone="danger">
          {getErrorMessage(settingsQuery.error, "Failed to load settings.")}
        </Banner>
      ) : null}

      {sessionQuery.isLoading ||
      !hasOwnerChannel ||
      settingsQuery.error ? null : (
        <>
          <SectionHeading
            eyebrow="Bot and access"
            title="Channel controls"
            description="Request settings and mod access rules for your channel."
          />

          {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}
          {saveWarning ? <Banner tone="warning">{saveWarning}</Banner> : null}
          {saveError ? <Banner tone="danger">{saveError}</Banner> : null}
          {status === "broadcaster_auth_required" ? (
            <div className="rounded-[24px] border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Twitch permissions need to be refreshed before the bot can run.{" "}
              <a
                href="/auth/twitch/start?redirectTo=%2Fdashboard%2Fsettings"
                className="font-semibold underline"
              >
                Reconnect Twitch
              </a>
              .
            </div>
          ) : null}

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>Primary controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <PermissionRow
                label="Enable playlist on your channel"
                checked={form.botChannelEnabled}
                onChange={(value) => setBoolean("botChannelEnabled", value)}
              />
              <PermissionRow
                label="Enable requests"
                checked={form.requestsEnabled}
                onChange={(value) => setBoolean("requestsEnabled", value)}
              />
              <PermissionRow
                label="Auto grant one VIP token to subscribers"
                checked={false}
                onChange={(value) =>
                  setBoolean("autoGrantVipTokenToSubscribers", value)
                }
                disabled
              />
              <p className="text-sm leading-7 text-amber-200">
                Not implemented yet.
              </p>
              <div className="grid gap-2">
                <p className="font-medium text-(--text)">Command prefix</p>
                <p className="text-sm leading-7 text-(--muted)">Usually !sr</p>
                <div className="max-w-32">
                  <Input
                    value={form.commandPrefix}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        commandPrefix: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <p className="font-medium text-(--text)">
                  Duplicate cooldown (minutes)
                </p>
                <p className="text-sm leading-7 text-(--muted)">
                  Time before the same song can be requested again.
                </p>
                <div className="max-w-40">
                  <Input
                    type="number"
                    min={0}
                    max={1440}
                    value={Math.floor(form.duplicateWindowSeconds / 60)}
                    onChange={(event) =>
                      setNumber(
                        "duplicateWindowSeconds",
                        (Number(event.target.value) || 0) * 60
                      )
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <SectionHeading
            eyebrow="Requests"
            title="Policy and queue rules"
            description="Control who can request, what songs are allowed, and how aggressively the queue is throttled."
          />

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>VIP token automation</CardTitle>
              <CardDescription>
                Automatically reward VIP tokens for gifted subs and cheers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-3 rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
                <p className="text-sm font-semibold text-(--text)">
                  Gifted subs
                </p>
                <PermissionRow
                  label="Give 1 VIP token to the gifter for each gifted sub"
                  checked={form.autoGrantVipTokensToSubGifters}
                  onChange={(value) =>
                    setBoolean("autoGrantVipTokensToSubGifters", value)
                  }
                />
                <PermissionRow
                  label="Give 1 VIP token to each gifted sub recipient"
                  checked={form.autoGrantVipTokensToGiftRecipients}
                  onChange={(value) =>
                    setBoolean("autoGrantVipTokensToGiftRecipients", value)
                  }
                />
              </div>

              <div
                className={`grid gap-4 rounded-[24px] border p-4 ${
                  form.autoGrantVipTokensForCheers
                    ? "border-(--border-strong) bg-(--panel-soft)"
                    : "border-(--border) bg-(--panel-muted)/40"
                }`}
              >
                <PermissionRow
                  label="Give VIP tokens for cheers"
                  checked={form.autoGrantVipTokensForCheers}
                  onChange={(value) =>
                    setBoolean("autoGrantVipTokensForCheers", value)
                  }
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <CompactNumberRow
                    label="Bits per 1 VIP token"
                    value={form.cheerBitsPerVipToken}
                    onChange={(value) =>
                      setNumber("cheerBitsPerVipToken", value)
                    }
                    disabled={!form.autoGrantVipTokensForCheers}
                  />
                  <div
                    className={`grid gap-2 ${!form.autoGrantVipTokensForCheers ? "opacity-60" : ""}`}
                  >
                    <p className="text-sm font-medium text-(--text)">
                      Minimum cheer to earn a partial token
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[25, 50, 75, 100].map((percent) => (
                        <button
                          key={percent}
                          type="button"
                          disabled={!form.autoGrantVipTokensForCheers}
                          onClick={() =>
                            setNumber(
                              "cheerMinimumTokenPercent",
                              percent as DashboardSettingsFormData["cheerMinimumTokenPercent"]
                            )
                          }
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed ${
                            form.cheerMinimumTokenPercent === percent
                              ? "border-(--brand) bg-(--brand) text-white"
                              : "border-(--border) bg-(--panel-muted) text-(--muted)"
                          }`}
                        >
                          {percent}%
                        </button>
                      ))}
                    </div>
                    <p className="text-xs leading-6 text-(--muted)">
                      Example: if 200 bits = 1 token and the minimum is 25%,
                      viewers need to cheer at least 50 bits to earn 0.25
                      tokens.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>Who can request</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PermissionRow
                label="Allow anyone to request"
                checked={form.allowAnyoneToRequest}
                onChange={(value) => setBoolean("allowAnyoneToRequest", value)}
              />
              <PermissionRow
                label="Allow subscribers to request"
                checked={
                  form.allowAnyoneToRequest
                    ? true
                    : form.allowSubscribersToRequest
                }
                onChange={(value) =>
                  setBoolean("allowSubscribersToRequest", value)
                }
                disabled={form.allowAnyoneToRequest}
              />
              <PermissionRow
                label="Allow channel VIPs to request"
                checked={
                  form.allowAnyoneToRequest ? true : form.allowVipsToRequest
                }
                onChange={(value) => setBoolean("allowVipsToRequest", value)}
                disabled={form.allowAnyoneToRequest}
              />
            </CardContent>
          </Card>

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>DLC restrictions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <PermissionRow
                label="Only allow official DLC"
                checked={form.onlyOfficialDlc}
                onChange={(value) => setBoolean("onlyOfficialDlc", value)}
              />
              <MultiSelectGrid
                title="Allowed tunings"
                groups={groupTuningOptions(tuningOptions)}
                selected={form.allowedTunings}
                onToggle={(value) =>
                  setForm((current) => ({
                    ...current,
                    allowedTunings: toggleArrayValue(
                      current.allowedTunings,
                      value
                    ),
                  }))
                }
              />
              <MultiSelectGrid
                title="Required paths"
                options={pathOptions}
                selected={form.requiredPaths}
                useBadges
                formatLabel={formatPathOptionLabel}
                toneByValue={getPathBadgeTone}
                leadingControl={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          requiredPathsMatchMode: "any",
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                        form.requiredPathsMatchMode === "any"
                          ? "border-(--brand) bg-(--brand) text-white"
                          : "border-(--border) bg-(--panel-muted) text-(--muted)"
                      }`}
                    >
                      Match any selected path
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          requiredPathsMatchMode: "all",
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                        form.requiredPathsMatchMode === "all"
                          ? "border-(--brand) bg-(--brand) text-white"
                          : "border-(--border) bg-(--panel-muted) text-(--muted)"
                      }`}
                    >
                      Match all selected paths
                    </button>
                  </div>
                }
                onToggle={(value) =>
                  setForm((current) => ({
                    ...current,
                    requiredPaths: toggleArrayValue(
                      current.requiredPaths,
                      value
                    ),
                  }))
                }
              />
            </CardContent>
          </Card>

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>Queue and rate limits</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="grid content-start gap-3 lg:pr-6 lg:border-r lg:border-(--border)">
                <p className="text-sm font-semibold text-(--text)">
                  Queue limits
                </p>
                <div className="divide-y divide-(--border)">
                  <CompactNumberRow
                    label="Maximum playlist size"
                    value={form.maxQueueSize}
                    onChange={(value) => setNumber("maxQueueSize", value)}
                  />
                  <CompactNumberRow
                    label="Max requests per viewer"
                    value={form.maxViewerRequestsAtOnce}
                    onChange={(value) =>
                      setNumber("maxViewerRequestsAtOnce", value)
                    }
                  />
                  <CompactNumberRow
                    label="Max requests per subscriber"
                    value={form.maxSubscriberRequestsAtOnce}
                    onChange={(value) =>
                      setNumber("maxSubscriberRequestsAtOnce", value)
                    }
                  />
                  <CompactNumberRow
                    label="Max VIP requests per viewer"
                    value={form.maxVipViewerRequestsAtOnce}
                    onChange={(value) =>
                      setNumber("maxVipViewerRequestsAtOnce", value)
                    }
                  />
                  <CompactNumberRow
                    label="Max VIP requests per subscriber"
                    value={form.maxVipSubscriberRequestsAtOnce}
                    onChange={(value) =>
                      setNumber("maxVipSubscriberRequestsAtOnce", value)
                    }
                  />
                </div>
              </div>

              <div className="grid content-start gap-4 lg:pl-6">
                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-(--text)">
                    Request rate limits
                  </p>

                  <div
                    className={`rounded-[20px] border p-4 ${
                      form.limitRegularRequestsEnabled
                        ? "border-(--border-strong) bg-(--panel-soft)"
                        : "border-(--border) bg-(--panel-muted)/40 opacity-70"
                    }`}
                  >
                    <PermissionRow
                      label="Enable regular request rate limit"
                      checked={form.limitRegularRequestsEnabled}
                      onChange={(value) =>
                        setBoolean("limitRegularRequestsEnabled", value)
                      }
                    />
                    <div className="mt-3 divide-y divide-(--border)">
                      <CompactNumberRow
                        label="Regular requests allowed"
                        value={form.regularRequestsPerPeriod}
                        onChange={(value) =>
                          setNumber("regularRequestsPerPeriod", value)
                        }
                        disabled={!form.limitRegularRequestsEnabled}
                      />
                      <CompactNumberRow
                        label="Regular period (seconds)"
                        value={form.regularRequestPeriodSeconds}
                        onChange={(value) =>
                          setNumber("regularRequestPeriodSeconds", value)
                        }
                        disabled={!form.limitRegularRequestsEnabled}
                      />
                    </div>
                  </div>

                  <div
                    className={`rounded-[20px] border p-4 ${
                      form.limitVipRequestsEnabled
                        ? "border-(--border-strong) bg-(--panel-soft)"
                        : "border-(--border) bg-(--panel-muted)/40 opacity-70"
                    }`}
                  >
                    <PermissionRow
                      label="Enable VIP request rate limit"
                      checked={form.limitVipRequestsEnabled}
                      onChange={(value) =>
                        setBoolean("limitVipRequestsEnabled", value)
                      }
                    />
                    <div className="mt-3 divide-y divide-(--border)">
                      <CompactNumberRow
                        label="VIP requests allowed"
                        value={form.vipRequestsPerPeriod}
                        onChange={(value) =>
                          setNumber("vipRequestsPerPeriod", value)
                        }
                        disabled={!form.limitVipRequestsEnabled}
                      />
                      <CompactNumberRow
                        label="VIP period (seconds)"
                        value={form.vipRequestPeriodSeconds}
                        onChange={(value) =>
                          setNumber("vipRequestPeriodSeconds", value)
                        }
                        disabled={!form.limitVipRequestsEnabled}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <SectionHeading
            eyebrow="Moderation"
            title="Channel rules and moderator permissions"
            description="Blacklist, setlist, and moderator capabilities determine what appears editable on the channel page."
          />

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>Filtering</CardTitle>
              <CardDescription>
                Blacklist and setlist entries are managed on the channel page.
                These toggles control how those rules are enforced.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PermissionRow
                label="Enable blacklist"
                checked={form.blacklistEnabled}
                onChange={(value) => setBoolean("blacklistEnabled", value)}
              />
              <PermissionRow
                label="Let setlist bypass blacklist"
                checked={form.letSetlistBypassBlacklist}
                onChange={(value) =>
                  setBoolean("letSetlistBypassBlacklist", value)
                }
              />
              <PermissionRow
                label="Enable setlist"
                checked={form.setlistEnabled}
                onChange={(value) => setBoolean("setlistEnabled", value)}
              />
              <PermissionRow
                label="Subscribers must follow setlist (non-subscribers must always follow setlist)"
                checked={form.subscribersMustFollowSetlist}
                onChange={(value) =>
                  setBoolean("subscribersMustFollowSetlist", value)
                }
              />
            </CardContent>
          </Card>

          <Card className="dashboard-settings__section">
            <CardHeader>
              <CardTitle>Moderator permissions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PermissionRow
                label="Manage requests"
                checked={form.moderatorCanManageRequests}
                onChange={(value) =>
                  setBoolean("moderatorCanManageRequests", value)
                }
              />
              <PermissionRow
                label="Manage blacklist"
                checked={form.moderatorCanManageBlacklist}
                onChange={(value) =>
                  setBoolean("moderatorCanManageBlacklist", value)
                }
              />
              <PermissionRow
                label="Manage setlist"
                checked={form.moderatorCanManageSetlist}
                onChange={(value) =>
                  setBoolean("moderatorCanManageSetlist", value)
                }
              />
              <PermissionRow
                label="Manage blocked chatters"
                checked={form.moderatorCanManageBlockedChatters}
                onChange={(value) =>
                  setBoolean("moderatorCanManageBlockedChatters", value)
                }
              />
              <PermissionRow
                label="View VIP tokens"
                checked={form.moderatorCanViewVipTokens}
                onChange={(value) =>
                  setBoolean("moderatorCanViewVipTokens", value)
                }
              />
              <PermissionRow
                label="Manage VIP tokens"
                checked={form.moderatorCanManageVipTokens}
                onChange={(value) =>
                  setBoolean("moderatorCanManageVipTokens", value)
                }
                disabled={!form.moderatorCanViewVipTokens}
              />
              <PermissionRow
                label="Manage tags"
                checked={form.moderatorCanManageTags}
                onChange={(value) =>
                  setBoolean("moderatorCanManageTags", value)
                }
              />
            </CardContent>
          </Card>

          <OverlaySettingsPanel />
        </>
      )}
    </div>
  );
}

function SectionHeading(props: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
        {props.eyebrow}
      </p>
      <h2 className="text-2xl font-semibold tracking-tight text-(--text)">
        {props.title}
      </h2>
      <p className="max-w-3xl text-sm leading-7 text-(--muted)">
        {props.description}
      </p>
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

function MultiSelectGrid(props: {
  title: string;
  options?: readonly string[];
  groups?: Array<{
    label: string;
    options: readonly string[];
  }>;
  selected: string[];
  onToggle: (value: string) => void;
  useBadges?: boolean;
  formatLabel?: (value: string) => string;
  toneByValue?: (value: string) => string;
  leadingControl?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-medium text-(--text)">{props.title}</p>
        {props.leadingControl}
      </div>
      {props.groups ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {props.groups.map((group) => (
            <div key={group.label} className="grid content-start gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                {group.label}
              </p>
              <div className="grid gap-1.5">
                {group.options.map((option) => {
                  const isSelected = props.selected.includes(option);
                  const label = props.formatLabel?.(option) ?? option;

                  return (
                    <label
                      key={option}
                      className={`flex items-center gap-2 rounded-[14px] px-2.5 py-1.5 transition-colors ${
                        isSelected
                          ? "bg-(--panel) text-(--text)"
                          : "text-(--muted)"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => props.onToggle(option)}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="text-sm leading-6">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={
            props.useBadges
              ? "mt-4 flex flex-wrap gap-3"
              : "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          }
        >
          {props.options?.map((option) => {
            const isSelected = props.selected.includes(option);
            const label = props.formatLabel?.(option) ?? option;

            return props.useBadges ? (
              <button
                key={option}
                type="button"
                onClick={() => props.onToggle(option)}
                aria-pressed={isSelected}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-[opacity,filter,transform,border-color,background-color,color] ${
                  isSelected
                    ? (props.toneByValue?.(option) ??
                      "border-(--brand) bg-(--brand) text-white")
                    : "border-(--border) bg-(--panel-muted) text-(--muted) opacity-45 saturate-50"
                }`}
              >
                {label}
              </button>
            ) : (
              <label
                key={option}
                className="flex items-center gap-3 rounded-[20px] border border-(--border) bg-(--panel-muted) px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => props.onToggle(option)}
                />
                <span className="text-sm text-(--text)">{label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PermissionRow(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 ${props.disabled ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        disabled={props.disabled}
        className="mt-1 h-4 w-4 shrink-0"
      />
      <span className="text-sm font-medium text-(--text)">{props.label}</span>
    </label>
  );
}

function CompactNumberRow(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 ${props.disabled ? "opacity-60" : ""}`}
    >
      <span className="min-w-0 text-sm font-medium text-(--text)">
        {props.label}
      </span>
      <div className="w-24 shrink-0">
        <Input
          type="number"
          min={0}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => props.onChange(Number(event.target.value) || 0)}
        />
      </div>
    </div>
  );
}

function formatPathOptionLabel(value: string) {
  return value === "voice" ? "Lyrics" : value;
}

function getPathBadgeTone(value: string) {
  switch (value.toLowerCase()) {
    case "lead":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
    case "rhythm":
      return "border-sky-400/30 bg-sky-500/10 text-sky-300";
    case "bass":
      return "border-orange-400/30 bg-orange-500/10 text-orange-300";
    case "voice":
    case "vocals":
      return "border-violet-400/30 bg-violet-500/10 text-violet-300";
    default:
      return "border-(--border-strong) bg-(--panel) text-(--text)";
  }
}

function groupTuningOptions(options: readonly string[]) {
  const groups = new Map<string, string[]>();

  for (const option of options) {
    const group = getTuningGroupLabel(option);
    const existing = groups.get(group);

    if (existing) {
      existing.push(option);
      continue;
    }

    groups.set(group, [option]);
  }

  return Array.from(groups.entries()).map(([label, groupOptions]) => ({
    label,
    options: groupOptions,
  }));
}

function getTuningGroupLabel(option: string) {
  if (option.startsWith("Open ")) {
    return "Open";
  }

  if (option === "Octave" || option === "Celtic" || option === "Other") {
    return "Other";
  }

  if (option.startsWith("High F") || option.startsWith("Low F")) {
    return "F";
  }

  if (option.startsWith("Low G")) {
    return "G";
  }

  const [firstToken = "Other"] = option.split(" ");

  if (firstToken === "Drop") {
    return "D";
  }

  return firstToken.replace(/[^A-G]/g, "") || "Other";
}
