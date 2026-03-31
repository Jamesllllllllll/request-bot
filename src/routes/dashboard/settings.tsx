// Route: Renders request behavior and channel configuration settings.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Copy } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
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
import { Checkbox } from "~/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { getBotStatusLabel } from "~/lib/bot-status";
import { pathOptions, tuningOptions } from "~/lib/channel-options";
import { pageTitle } from "~/lib/page-title";
import { DEFAULT_MAX_QUEUE_SIZE } from "~/lib/settings-defaults";
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
  ownedOfficialDlcImport: {
    count: number;
    importedAt: number | null;
  };
  integrations: {
    streamElementsTipRelayUrl: string | null;
  };
  bot: {
    connected: boolean;
    configuredUsername: string;
  };
};

type ViewerSessionData = {
  viewer: null | {
    user: {
      twitchUserId: string;
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
  };
};

const allTuningOptions = Array.from(tuningOptions);
const mockOwnedOfficialDlcRows = [
  ["Symphony No. 40", "Wolfgang Amadeus Mozart", false],
  ["Even Flow", "Pearl Jam", true],
  ["Cold Shot", "Stevie Ray Vaughan & Double Trouble", false],
] as const;

const defaultForm: DashboardSettingsFormData = {
  botChannelEnabled: false,
  moderatorCanManageRequests: true,
  moderatorCanManageBlacklist: true,
  moderatorCanManageSetlist: true,
  moderatorCanManageBlockedChatters: true,
  moderatorCanViewVipTokens: true,
  moderatorCanManageVipTokens: true,
  moderatorCanManageTags: true,
  requestsEnabled: true,
  allowAnyoneToRequest: true,
  allowSubscribersToRequest: true,
  allowVipsToRequest: true,
  onlyOfficialDlc: false,
  allowedTunings: allTuningOptions,
  requiredPaths: [],
  requiredPathsMatchMode: "any",
  maxQueueSize: DEFAULT_MAX_QUEUE_SIZE,
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
  autoGrantVipTokensForSharedSubRenewalMessage: false,
  autoGrantVipTokensToSubGifters: false,
  autoGrantVipTokensToGiftRecipients: false,
  autoGrantVipTokensForCheers: false,
  autoGrantVipTokensForRaiders: false,
  autoGrantVipTokensForStreamElementsTips: false,
  allowRequestPathModifiers: false,
  cheerBitsPerVipToken: 200,
  cheerMinimumTokenPercent: 25,
  raidMinimumViewerCount: 1,
  streamElementsTipAmountPerVipToken: 5,
  duplicateWindowSeconds: 900,
  showPlaylistPositions: false,
  commandPrefix: "!sr",
};

const twitchExtensionInstallUrl =
  "https://dashboard.twitch.tv/extensions/gojrfj73vbfx7fww479a77kpvyrz91-0.0.1";
const twitchExtensionBetaUserIds = new Set([
  "152539019",
  "26914244",
  "44932690",
  "49572641",
]);

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [{ title: pageTitle("Settings") }],
  }),
  component: DashboardSettingsPage,
});

function DashboardSettingsPage() {
  const queryClient = useQueryClient();
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedIndicatorPhase, setSavedIndicatorPhase] = useState<
    "hidden" | "visible" | "fading"
  >("hidden");
  const [relayUrlCopied, setRelayUrlCopied] = useState(false);
  const sessionQuery = useQuery<ViewerSessionData>({
    queryKey: ["viewer-session"],
    queryFn: async () => {
      const response = await fetch("/api/session", {
        credentials: "include",
      });
      return response.json() as Promise<ViewerSessionData>;
    },
  });
  const viewer = sessionQuery.data?.viewer ?? null;
  const hasOwnerChannel = !!viewer?.channel;
  const canSeeTwitchExtensionInstall =
    !!viewer &&
    (viewer.user.isAdmin === true ||
      twitchExtensionBetaUserIds.has(viewer.user.twitchUserId));
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
  const [officialDlcOpen, setOfficialDlcOpen] = useState(false);
  const [allowedTuningsOpen, setAllowedTuningsOpen] = useState(false);
  const [requiredPathsOpen, setRequiredPathsOpen] = useState(false);

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setForm(normalizeSettingsFormData(settingsQuery.data.settings));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (savedIndicatorPhase === "hidden") {
      return;
    }

    if (savedIndicatorPhase === "visible") {
      const fadeTimer = window.setTimeout(() => {
        setSavedIndicatorPhase("fading");
      }, 1000);

      return () => {
        window.clearTimeout(fadeTimer);
      };
    }

    const hideTimer = window.setTimeout(() => {
      setSavedIndicatorPhase("hidden");
    }, 300);

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [savedIndicatorPhase]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        moderatorCanViewVipTokens: true,
      } as SettingsInputData;
      const response = await fetch("/api/dashboard/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; warning?: string | null }
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? "Settings could not be saved.")
            : "Settings could not be saved."
        );
      }

      return body as { message?: string; warning?: string | null };
    },
    onMutate: () => {
      setSaveWarning(null);
      setSaveError(null);
      setSavedIndicatorPhase("hidden");

      return {
        submittedForm: normalizeSettingsFormData(form),
      };
    },
    onSuccess: async (payload, _variables, context) => {
      if (context?.submittedForm) {
        queryClient.setQueryData<DashboardSettingsData | undefined>(
          ["dashboard-settings"],
          (current) =>
            current
              ? {
                  ...current,
                  settings: context.submittedForm,
                }
              : current
        );
      }

      setSaveWarning(payload?.warning ?? null);
      setSavedIndicatorPhase("visible");
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
  const savedSettings = settingsQuery.data?.settings
    ? normalizeSettingsFormData(settingsQuery.data.settings)
    : null;
  const hasUnsavedChanges = savedSettings
    ? getSettingsComparisonSnapshot(form) !==
      getSettingsComparisonSnapshot(savedSettings)
    : false;
  const canSaveSettings =
    hasOwnerChannel &&
    !settingsQuery.isLoading &&
    !settingsQuery.error &&
    hasUnsavedChanges &&
    !mutation.isPending;
  const activeSaveNotice = saveError
    ? {
        tone: "danger" as const,
        message: saveError,
      }
    : saveWarning
      ? {
          tone: "warning" as const,
          message: saveWarning,
        }
      : null;
  const reserveSaveNoticeSpace = !!saveWarning || !!saveError;
  const pathSummary = buildRequiredPathsSummary(
    form.requiredPaths,
    form.requiredPathsMatchMode
  );
  const streamElementsTipRelayUrl =
    settingsQuery.data?.integrations.streamElementsTipRelayUrl ?? null;
  const cheerMinimumBits = getCheerMinimumBitsPreview(
    form.cheerBitsPerVipToken,
    form.cheerMinimumTokenPercent
  );
  const cheerMinimumPartialTokens =
    form.cheerBitsPerVipToken > 0
      ? cheerMinimumBits / form.cheerBitsPerVipToken
      : 0;

  function toggleArrayValue(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value];
  }

  function toggleAllowedTuning(tuning: string) {
    setForm((current) => ({
      ...current,
      allowedTunings: toggleArrayValue(current.allowedTunings, tuning),
    }));
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

  async function copyRelayUrl() {
    if (!streamElementsTipRelayUrl) {
      return;
    }

    await navigator.clipboard.writeText(streamElementsTipRelayUrl);
    setRelayUrlCopied(true);
    window.setTimeout(() => {
      setRelayUrlCopied(false);
    }, 1500);
  }

  return (
    <div className="page-section-stack dashboard-settings grid gap-6">
      <DashboardPageHeader
        title="Settings"
        description="Owner-only channel configuration for requests, moderators, and the stream overlay."
        meta={
          canSeeTwitchExtensionInstall ? (
            <p className="max-w-2xl text-sm leading-7 text-(--muted)">
              Beta testers can install the Twitch extension panel on Twitch.
            </p>
          ) : null
        }
        actions={
          hasOwnerChannel || canSeeTwitchExtensionInstall ? (
            <div className="flex flex-wrap gap-2">
              {hasOwnerChannel ? (
                <Button asChild variant="outline">
                  <a href="/dashboard/panel-preview" className="no-underline">
                    Preview mod panel
                  </a>
                </Button>
              ) : null}
              {canSeeTwitchExtensionInstall ? (
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
              ) : null}
            </div>
          ) : null
        }
        aside={
          hasOwnerChannel ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={status === "active" ? "default" : "outline"}>
                {getBotStatusLabel(status)}
              </Badge>
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
            <CardTitle as="h2" className="text-xl leading-tight md:text-2xl">
              Owner settings only
            </CardTitle>
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
                  className="flex flex-wrap items-center justify-between gap-3 border border-(--border) bg-(--panel-soft) px-4 py-4"
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
          <div className="grid gap-6">
            <div className="sticky top-3 z-20">
              <div
                className={`surface-grid surface-noise flex flex-wrap items-center justify-between gap-3 border px-4 py-3 backdrop-blur-sm transition-colors ${
                  saveError
                    ? "border-red-500/40 bg-red-500/10"
                    : mutation.isPending || hasUnsavedChanges
                      ? "border-(--brand) bg-(--panel) shadow-(--glow)"
                      : "border-(--border-strong) bg-(--panel-soft)"
                }`}
              >
                <div className="grid gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                    Settings
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      saveError
                        ? "text-red-200"
                        : mutation.isPending || hasUnsavedChanges
                          ? "text-(--text)"
                          : "text-(--muted)"
                    }`}
                  >
                    {settingsQuery.isLoading
                      ? "Loading settings..."
                      : saveError
                        ? "Save failed. Review the message below and try again."
                        : mutation.isPending
                          ? "Saving settings..."
                          : hasUnsavedChanges
                            ? "You have unsaved changes."
                            : "All changes are saved."}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    aria-live="polite"
                    className={`text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200 transition-opacity duration-300 ${
                      savedIndicatorPhase === "hidden"
                        ? "pointer-events-none opacity-0"
                        : savedIndicatorPhase === "fading"
                          ? "opacity-0"
                          : "opacity-100"
                    }`}
                  >
                    Saved
                  </span>
                  <Button
                    onClick={() => mutation.mutate()}
                    disabled={!canSaveSettings}
                    variant={
                      hasUnsavedChanges || mutation.isPending
                        ? "default"
                        : "outline"
                    }
                  >
                    {mutation.isPending ? "Saving..." : "Save settings"}
                  </Button>
                </div>
              </div>
            </div>

            <div
              className={reserveSaveNoticeSpace ? "min-h-14" : ""}
              style={{ overflowAnchor: "none" }}
            >
              {activeSaveNotice ? (
                <Banner tone={activeSaveNotice.tone}>
                  {activeSaveNotice.message}
                </Banner>
              ) : null}
            </div>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  Channel setup
                </CardTitle>
                <CardDescription>
                  Control the main playlist toggles, chat command, and
                  viewer-facing playlist behavior.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-4">
                  {status === "broadcaster_auth_required" ? (
                    <div className="border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                      Twitch permissions need to be refreshed before the bot can
                      run.{" "}
                      <a
                        href="/auth/twitch/start?redirectTo=%2Fdashboard%2Fsettings"
                        className="font-semibold underline"
                      >
                        Reconnect Twitch
                      </a>
                      .
                    </div>
                  ) : null}
                  <div className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
                    <h3 className="text-sm font-semibold text-(--text)">
                      Main toggles
                    </h3>
                    <PermissionRow
                      label="Enable bot on this channel"
                      checked={form.botChannelEnabled}
                      onChange={(value) =>
                        setBoolean("botChannelEnabled", value)
                      }
                    />
                    <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                      Turn this off when you do not want request-bot actions,
                      including awarding VIP tokens for subscriptions, raids,
                      etc.
                    </div>
                    <PermissionRow
                      label="Enable requests"
                      checked={form.requestsEnabled}
                      onChange={(value) => setBoolean("requestsEnabled", value)}
                    />
                    <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                      Turning requests off keeps playlist management available
                      to you and your moderators, but viewers cannot add songs.
                    </div>
                  </div>

                  <div className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
                    <h3 className="text-sm font-semibold text-(--text)">
                      Playlist display
                    </h3>
                    <PermissionRow
                      label="Show playlist positions"
                      checked={form.showPlaylistPositions}
                      onChange={(value) =>
                        setBoolean("showPlaylistPositions", value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  <FieldBlock
                    label="Command prefix"
                    description="Use the command viewers type in chat."
                  >
                    <div className="max-w-32">
                      <Input
                        value={form.commandPrefix}
                        spellCheck={false}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            commandPrefix: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </FieldBlock>
                  <FieldBlock
                    label="Request modifiers"
                    description="Let chat request bass arrangements with the *bass modifier."
                  >
                    <PermissionRow
                      label="Allow the *bass modifier in chat commands"
                      checked={form.allowRequestPathModifiers}
                      onChange={(value) =>
                        setBoolean("allowRequestPathModifiers", value)
                      }
                    />
                  </FieldBlock>
                  <FieldBlock
                    label="Duplicate cooldown (minutes)"
                    description="Set how long the same song waits before it can be requested again."
                  >
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
                  </FieldBlock>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  Who can request
                </CardTitle>
                <CardDescription>
                  Choose which viewers can add songs to your playlist.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <PermissionRow
                  label="Anyone can request"
                  checked={form.allowAnyoneToRequest}
                  onChange={(value) =>
                    setBoolean("allowAnyoneToRequest", value)
                  }
                />
                <PermissionRow
                  label="Subscribers can request"
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
                  label="Channel VIPs can request"
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
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  Search and request filters
                </CardTitle>
                <CardDescription>
                  These rules limit what appears in search and what viewers can
                  request on your channel page.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FilterSection
                  title="Official DLC"
                  description="Limit search results and requests to official DLC."
                  open={officialDlcOpen}
                  onOpenChange={setOfficialDlcOpen}
                >
                  <div className="grid gap-3">
                    <div className="border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                      Official DLC filters are not available yet. This section
                      previews settings that appear here in a future update.
                    </div>
                    <div className="grid gap-3 border border-(--border) bg-(--panel-muted) p-3">
                      <PermissionRow
                        label="Only include official DLC"
                        checked={form.onlyOfficialDlc}
                        onChange={(value) =>
                          setBoolean("onlyOfficialDlc", value)
                        }
                        disabled
                      />
                      <PermissionRow
                        label="Only include official DLC that I own"
                        checked={false}
                        onChange={() => {}}
                        disabled
                      />
                    </div>

                    <div className="grid gap-3 border border-(--border) bg-(--panel-muted) p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-(--text)">
                          Owned official DLC
                        </p>
                        <Button type="button" variant="outline" disabled>
                          Import from CustomsForge Song Manager
                        </Button>
                      </div>
                      <div className="divide-y divide-(--border) border border-(--border)">
                        {mockOwnedOfficialDlcRows.map(
                          ([title, artist, owned]) => (
                            <div
                              key={`${artist}-${title}`}
                              className="flex items-center justify-between gap-3 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-(--text)">
                                  {title}
                                </p>
                                <p className="truncate text-xs text-(--muted)">
                                  {artist}
                                </p>
                              </div>
                              <span
                                className={`border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                                  owned
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-(--border) bg-(--panel) text-(--muted)"
                                }`}
                              >
                                {owned ? "Owned" : "Not owned"}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </FilterSection>

                <FilterSection
                  title="Allowed tunings"
                  description="Click any tuning to allow or block it."
                  open={allowedTuningsOpen}
                  onOpenChange={setAllowedTuningsOpen}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 grid gap-4">
                      {groupTuningOptions(tuningOptions).map((group) => (
                        <div key={group.label} className="grid gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                            {group.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {group.options.map((option) => {
                              const isSelected =
                                form.allowedTunings.includes(option);

                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => toggleAllowedTuning(option)}
                                  aria-pressed={isSelected}
                                  className={`border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                    isSelected
                                      ? "border-(--brand) bg-(--brand) text-white"
                                      : "border-(--border) bg-(--panel-muted) text-(--muted)"
                                  }`}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          allowedTunings: allTuningOptions,
                        }))
                      }
                    >
                      Allow all
                    </Button>
                  </div>
                </FilterSection>

                <FilterSection
                  title="Required paths"
                  description="Choose the paths a song needs before it appears in search or can be requested."
                  open={requiredPathsOpen}
                  onOpenChange={setRequiredPathsOpen}
                >
                  <div className="grid gap-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            requiredPathsMatchMode: "any",
                          }))
                        }
                        className={`border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
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
                        className={`border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                          form.requiredPathsMatchMode === "all"
                            ? "border-(--brand) bg-(--brand) text-white"
                            : "border-(--border) bg-(--panel-muted) text-(--muted)"
                        }`}
                      >
                        Match all selected paths
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pathOptions.map((option) => {
                        const isSelected = form.requiredPaths.includes(option);

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                requiredPaths: toggleArrayValue(
                                  current.requiredPaths,
                                  option
                                ),
                              }))
                            }
                            aria-pressed={isSelected}
                            className={`border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                              isSelected
                                ? getPathBadgeTone(option)
                                : "border-(--border) bg-(--panel-muted) text-(--muted)"
                            }`}
                          >
                            {formatPathOptionLabel(option)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid gap-2 border border-(--border) bg-(--panel-muted) p-3">
                      <p className="text-sm font-medium text-(--text)">
                        {pathSummary.summary}
                      </p>
                      {pathSummary.example ? (
                        <p className="text-sm leading-6 text-(--muted)">
                          {pathSummary.example}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </FilterSection>
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  Queue and rate limits
                </CardTitle>
                <CardDescription>
                  Set the playlist size and decide how often regular or VIP
                  requests can be added.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="grid min-w-0 content-start gap-3 border border-(--border) bg-(--panel-soft) p-4">
                  <h3 className="text-sm font-semibold text-(--text)">
                    Queue limits
                  </h3>
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

                <div className="grid min-w-0 content-start gap-3 border border-(--border) bg-(--panel-soft) p-4">
                  <h3 className="text-sm font-semibold text-(--text)">
                    Request rate limits
                  </h3>

                  <div
                    className={`grid gap-3 ${
                      !form.limitRegularRequestsEnabled ? "opacity-70" : ""
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      Regular
                    </p>
                    <PermissionRow
                      label="Enable regular request rate limit"
                      checked={form.limitRegularRequestsEnabled}
                      onChange={(value) =>
                        setBoolean("limitRegularRequestsEnabled", value)
                      }
                    />
                    <div className="divide-y divide-(--border)">
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
                    className={`grid gap-3 border-t border-(--border) pt-3 ${
                      !form.limitVipRequestsEnabled ? "opacity-70" : ""
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      VIP
                    </p>
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
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  VIP token automation
                </CardTitle>
                <CardDescription>
                  Automatically reward VIP tokens for new subs, gifted subs,
                  raids, cheers, and StreamElements tips.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                  <div className="grid min-w-0 gap-4">
                    <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                      <h3 className="text-sm font-semibold text-(--text)">
                        Subscribes
                      </h3>
                      <PermissionRow
                        label="Give 1 VIP token for a new paid sub"
                        checked={form.autoGrantVipTokenToSubscribers}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokenToSubscribers", value)
                        }
                      />
                      <PermissionRow
                        label="Give 1 VIP token for a shared sub renewal message"
                        checked={
                          form.autoGrantVipTokensForSharedSubRenewalMessage
                        }
                        onChange={(value) =>
                          setBoolean(
                            "autoGrantVipTokensForSharedSubRenewalMessage",
                            value
                          )
                        }
                      />
                      <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                        Quiet sub renewals do not award automatically. Twitch
                        only sends a renewal event here when the viewer shares
                        the resub message in chat.
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                      <h3 className="text-sm font-semibold text-(--text)">
                        Gifted subs
                      </h3>
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
                          setBoolean(
                            "autoGrantVipTokensToGiftRecipients",
                            value
                          )
                        }
                      />
                    </div>

                    <div
                      className={`grid min-w-0 gap-3 border bg-(--panel-soft) p-4 ${
                        form.autoGrantVipTokensForRaiders
                          ? "border-(--border-strong)"
                          : "border-(--border) opacity-70"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-(--text)">
                        Raids
                      </h3>
                      <PermissionRow
                        label="Give 1 VIP token to the streamer who raids this channel"
                        checked={form.autoGrantVipTokensForRaiders}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokensForRaiders", value)
                        }
                      />
                      <FieldBlock
                        label="Minimum raid size"
                        description="Set 1 to reward every raid."
                      >
                        <div className="max-w-32">
                          <Input
                            type="number"
                            min={1}
                            value={form.raidMinimumViewerCount}
                            disabled={!form.autoGrantVipTokensForRaiders}
                            onChange={(event) =>
                              setNumber(
                                "raidMinimumViewerCount",
                                Math.max(1, Number(event.target.value) || 0)
                              )
                            }
                          />
                        </div>
                      </FieldBlock>
                      <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                        Twitch only sends raid rewards here when the raid shows
                        up in chat.
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 content-start gap-4">
                    <div
                      className={`grid min-w-0 gap-3 border bg-(--panel-soft) p-4 ${
                        form.autoGrantVipTokensForCheers
                          ? "border-(--border-strong)"
                          : "border-(--border) opacity-70"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-(--text)">
                        Cheers
                      </h3>
                      <PermissionRow
                        label="Give VIP tokens for cheers"
                        checked={form.autoGrantVipTokensForCheers}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokensForCheers", value)
                        }
                      />
                      <div
                        className={`grid gap-3 ${!form.autoGrantVipTokensForCheers ? "opacity-60" : ""}`}
                      >
                        <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                          <div className="grid gap-1.5">
                            <p className="text-sm font-medium text-(--text)">
                              Cheer conversion
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="w-24 shrink-0">
                                <Input
                                  id="cheer-bits-per-vip-token"
                                  type="number"
                                  min={0}
                                  value={form.cheerBitsPerVipToken}
                                  disabled={!form.autoGrantVipTokensForCheers}
                                  onChange={(event) =>
                                    setNumber(
                                      "cheerBitsPerVipToken",
                                      Number(event.target.value) || 0
                                    )
                                  }
                                />
                              </div>
                              <label
                                htmlFor="cheer-bits-per-vip-token"
                                className="text-sm text-(--muted)"
                              >
                                bits per 1 VIP token
                              </label>
                            </div>
                          </div>
                          <div className="grid gap-1.5">
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
                                  className={`border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed ${
                                    form.cheerMinimumTokenPercent === percent
                                      ? "border-(--brand) bg-(--brand) text-white"
                                      : "border-(--border) bg-(--panel-muted) text-(--muted)"
                                  }`}
                                >
                                  {percent}%
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-1.5 border border-dashed border-(--border) bg-(--panel-muted) p-3">
                          <p className="text-sm font-medium text-(--text)">
                            Live example
                          </p>
                          {form.cheerBitsPerVipToken > 0 ? (
                            <>
                              <p className="text-sm leading-6 text-(--muted)">
                                Minimum cheer:{" "}
                                {formatSettingsNumber(cheerMinimumBits)} bits
                                grants{" "}
                                {formatSettingsNumber(
                                  cheerMinimumPartialTokens
                                )}{" "}
                                of a VIP token at the{" "}
                                {form.cheerMinimumTokenPercent}% threshold.
                              </p>
                              <p className="text-sm leading-6 text-(--muted)">
                                {formatSettingsNumber(
                                  form.cheerBitsPerVipToken
                                )}{" "}
                                bits grants 1 VIP token.{" "}
                                {formatSettingsNumber(
                                  form.cheerBitsPerVipToken * 5
                                )}{" "}
                                bits grants 5 VIP tokens.
                              </p>
                            </>
                          ) : (
                            <p className="text-sm leading-6 text-(--muted)">
                              Set the bits per VIP token above 0 to preview the
                              minimum cheer threshold.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`grid min-w-0 gap-3 border bg-(--panel-soft) p-4 ${
                        form.autoGrantVipTokensForStreamElementsTips
                          ? "border-(--border-strong)"
                          : "border-(--border) opacity-70"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-(--text)">
                        Tips
                      </h3>
                      <PermissionRow
                        label="Give VIP tokens for StreamElements tips"
                        checked={form.autoGrantVipTokensForStreamElementsTips}
                        onChange={(value) =>
                          setBoolean(
                            "autoGrantVipTokensForStreamElementsTips",
                            value
                          )
                        }
                      />
                      <div
                        className={`grid gap-3 ${!form.autoGrantVipTokensForStreamElementsTips ? "opacity-60" : ""}`}
                      >
                        <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                          <FieldBlock
                            label="Tip amount per 1 VIP token"
                            description="A $25 tip grants 5 VIP tokens when this is set to 5."
                          >
                            <div className="max-w-40">
                              <Input
                                type="number"
                                min={0.01}
                                step={0.01}
                                value={form.streamElementsTipAmountPerVipToken}
                                disabled={
                                  !form.autoGrantVipTokensForStreamElementsTips
                                }
                                onChange={(event) =>
                                  setNumber(
                                    "streamElementsTipAmountPerVipToken",
                                    Number(event.target.value) || 0
                                  )
                                }
                              />
                            </div>
                          </FieldBlock>
                          <FieldBlock
                            label="Relay URL"
                            description="Use this URL in the Streamer.bot step that forwards your StreamElements tip event."
                          >
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
                              <Input
                                value={streamElementsTipRelayUrl ?? ""}
                                readOnly
                                disabled={!streamElementsTipRelayUrl}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={copyRelayUrl}
                                disabled={!streamElementsTipRelayUrl}
                                className="self-stretch"
                              >
                                <Copy className="h-4 w-4" />
                                {relayUrlCopied ? "Copied" : "Copy URL"}
                              </Button>
                            </div>
                          </FieldBlock>
                        </div>
                        <div className="grid gap-2 border border-(--border) bg-(--panel-muted) p-3">
                          <p className="text-sm font-medium text-(--text)">
                            Setup
                          </p>
                          <p className="text-sm leading-6 text-(--muted)">
                            StreamElements can keep showing tip alerts in OBS
                            the way you already use them. VIP token rewards need
                            Streamer.bot to forward the tip event here.
                          </p>
                          <ol className="grid gap-1.5 pl-5 text-sm leading-6 text-(--muted) list-decimal">
                            <li>Connect Streamer.bot to StreamElements.</li>
                            <li>
                              Use the StreamElements Tip trigger in
                              Streamer.bot.
                            </li>
                            <li>
                              Send that tip event to the Relay URL shown here.
                            </li>
                            <li>
                              Without Streamer.bot, tips still show in OBS, but
                              they do not add VIP tokens here.
                            </li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  Blacklist and setlist rules
                </CardTitle>
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
                  label="Subscribers must follow setlist"
                  checked={form.subscribersMustFollowSetlist}
                  onChange={(value) =>
                    setBoolean("subscribersMustFollowSetlist", value)
                  }
                />
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  Moderator permissions
                </CardTitle>
                <CardDescription>
                  Moderators always see VIP tokens. Turn other
                  channel-management actions on or off here.
                </CardDescription>
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
                  label="Manage blocked viewers"
                  checked={form.moderatorCanManageBlockedChatters}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageBlockedChatters", value)
                  }
                />
                <PermissionRow
                  label="Manage VIP tokens"
                  checked={form.moderatorCanManageVipTokens}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageVipTokens", value)
                  }
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
          </div>

          <OverlaySettingsPanel />
        </>
      )}
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
    <div className={`border p-4 text-sm ${toneClass}`}>{props.children}</div>
  );
}

function FieldBlock(props: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2 border border-(--border) bg-(--panel-soft) p-4">
      <p className="font-medium text-(--text)">{props.label}</p>
      {props.description ? (
        <p className="text-sm leading-6 text-(--muted)">{props.description}</p>
      ) : null}
      {props.children}
    </div>
  );
}

function FilterSection(props: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Collapsible
      open={props.open}
      onOpenChange={props.onOpenChange}
      className="overflow-hidden border border-(--border) bg-(--panel-soft)"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-(--panel)"
        >
          <div className="grid gap-1">
            <h3 className="text-lg font-semibold leading-tight text-(--text)">
              {props.title}
            </h3>
            <p className="text-sm leading-6 text-(--muted)">
              {props.description}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
            {props.open ? "Hide" : "Show"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                props.open ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-(--border) bg-(--panel-soft) px-4 py-4">
        {props.children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PermissionRow(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const inputId = useId();

  return (
    <div
      className={`flex items-start gap-3 rounded-[8px] px-1 py-1 ${props.disabled ? "opacity-60" : ""}`}
    >
      <Checkbox
        id={inputId}
        checked={props.checked}
        onCheckedChange={(checked) => props.onChange(checked === true)}
        disabled={props.disabled}
        className="mt-0.5"
      />
      <label
        htmlFor={inputId}
        className="pt-0.5 text-sm font-medium text-(--text)"
      >
        {props.label}
      </label>
    </div>
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

function getCheerMinimumBitsPreview(
  bitsPerVipToken: number,
  minimumTokenPercent: DashboardSettingsFormData["cheerMinimumTokenPercent"]
) {
  return Math.ceil(Math.max(0, bitsPerVipToken) * (minimumTokenPercent / 100));
}

function formatSettingsNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeSettingsFormData(
  settings: DashboardSettingsFormData
): DashboardSettingsFormData {
  return {
    ...settings,
    allowedTunings: settings.allowedTunings.length
      ? settings.allowedTunings
      : allTuningOptions,
    moderatorCanViewVipTokens: true,
  };
}

function getSettingsComparisonSnapshot(settings: DashboardSettingsFormData) {
  const normalized = normalizeSettingsFormData(settings);

  return JSON.stringify({
    ...normalized,
    allowedTunings: [...normalized.allowedTunings].sort(),
    requiredPaths: [...normalized.requiredPaths].sort(),
  });
}

function formatPathOptionLabel(value: string) {
  return value === "voice" ? "Lyrics" : value;
}

function getPathBadgeTone(value: string) {
  switch (value.toLowerCase()) {
    case "lead":
      return "border-emerald-700/50 bg-emerald-950 text-emerald-100";
    case "rhythm":
      return "border-sky-700/50 bg-sky-950 text-sky-100";
    case "bass":
      return "border-orange-700/50 bg-orange-950 text-orange-100";
    case "voice":
    case "vocals":
      return "border-violet-700/50 bg-violet-950 text-violet-100";
    default:
      return "border-(--border-strong) bg-(--panel) text-(--text)";
  }
}

function getPathExampleTone(value: string) {
  switch (value.toLowerCase()) {
    case "lead":
      return "text-emerald-300";
    case "rhythm":
      return "text-sky-300";
    case "bass":
      return "text-orange-300";
    case "voice":
    case "vocals":
      return "text-violet-300";
    default:
      return "text-(--text)";
  }
}

function buildRequiredPathsSummary(
  requiredPaths: string[],
  matchMode: "any" | "all"
) {
  const extraPath = getExampleExtraPath(requiredPaths);

  if (requiredPaths.length === 0) {
    return {
      summary:
        "No path filter is active. Songs can match with any path combination.",
      example: null,
    };
  }

  if (requiredPaths.length === 1) {
    return {
      summary: (
        <>
          Songs must include {renderPathLabel(requiredPaths[0])}. They can still
          include any other paths.
        </>
      ),
      example: (
        <>
          Example: a song with{" "}
          {renderPathExampleSequence(
            extraPath ? [requiredPaths[0], extraPath] : [requiredPaths[0]]
          )}{" "}
          still matches.
        </>
      ),
    };
  }

  if (matchMode === "any") {
    const selectedPath = requiredPaths[1] ?? requiredPaths[0];
    return {
      summary: (
        <>
          Songs match if they include at least one of{" "}
          {renderPathSummaryList(requiredPaths)}. They can still include any
          other paths.
        </>
      ),
      example: (
        <>
          Example: a song with{" "}
          {renderPathExampleSequence(
            extraPath ? [selectedPath, extraPath] : [selectedPath]
          )}{" "}
          still matches because it includes one selected path.
        </>
      ),
    };
  }

  return {
    summary: (
      <>
        Songs match only if they include all of{" "}
        {renderPathSummaryList(requiredPaths)}. They can still include any other
        paths.
      </>
    ),
    example: (
      <>
        Example: a song with{" "}
        {renderPathExampleSequence(
          extraPath ? [...requiredPaths, extraPath] : requiredPaths
        )}{" "}
        still matches because it includes every selected path.
      </>
    ),
  };
}

function renderPathExampleSequence(values: string[]) {
  const content: ReactNode[] = [];

  values.forEach((value, index) => {
    if (index > 0) {
      content.push(
        <span key={`separator-${index}`} className="text-(--muted)">
          {" + "}
        </span>
      );
    }

    content.push(renderPathExampleLabel(value, "", `${value}-${index}`));
  });

  return content;
}

function renderPathSummaryList(values: string[]) {
  const content: ReactNode[] = [];

  values.forEach((value, index) => {
    if (index > 0) {
      const separator =
        index === values.length - 1
          ? values.length === 2
            ? " and "
            : ", and "
          : ", ";

      content.push(
        <span key={`summary-separator-${index}`} className="text-(--muted)">
          {separator}
        </span>
      );
    }

    content.push(renderPathLabel(value, "", `summary-${value}-${index}`));
  });

  return content;
}

function renderPathLabel(value: string, suffix = "", key?: string) {
  return (
    <span
      key={key}
      className={`font-semibold uppercase tracking-[0.18em] ${getPathExampleTone(
        value
      )}`}
    >
      {formatPathOptionLabel(value).toUpperCase()}
      {suffix}
    </span>
  );
}

function renderPathExampleLabel(value: string, suffix = "", key?: string) {
  return renderPathLabel(value, suffix, key);
}

function getExampleExtraPath(requiredPaths: string[]) {
  return pathOptions.find((option) => !requiredPaths.includes(option));
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
