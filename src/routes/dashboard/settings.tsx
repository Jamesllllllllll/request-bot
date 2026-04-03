// Route: Renders request behavior and channel configuration settings.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Copy } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { OverlaySettingsPanel } from "~/components/overlay-settings-panel";
import { TranslationHelpButton } from "~/components/translation-help-button";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { getBotStatusKey } from "~/lib/bot-status";
import { pathOptions, tuningOptions } from "~/lib/channel-options";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { formatNumber } from "~/lib/i18n/format";
import { defaultLocale, localeOptions } from "~/lib/i18n/locales";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";
import { DEFAULT_MAX_QUEUE_SIZE } from "~/lib/settings-defaults";
import { buildStreamElementsTipRelayCode } from "~/lib/streamelements/instructions";
import type { ChannelPointRewardEligibility } from "~/lib/twitch/channel-point-reward-eligibility";
import { unknownChannelPointRewardEligibility } from "~/lib/twitch/channel-point-reward-eligibility";
import {
  defaultChannelPointRewardCost,
  vipTokenChannelPointRewardTitle,
} from "~/lib/twitch/channel-point-rewards";
import { getErrorMessage } from "~/lib/utils";
import type { SettingsInputData } from "~/lib/validation";
import { viewerSessionQueryOptions } from "~/lib/viewer-session-query";
import {
  formatVipDurationThresholdMinutes,
  normalizeVipTokenDurationThresholds,
} from "~/lib/vip-token-duration-thresholds";

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
  channelPointRewardsEligibility: ChannelPointRewardEligibility;
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
  defaultLocale,
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
  vipRequestCooldownEnabled: false,
  vipRequestCooldownMinutes: 0,
  blacklistEnabled: false,
  letSetlistBypassBlacklist: false,
  setlistEnabled: false,
  subscribersMustFollowSetlist: false,
  autoGrantVipTokenToSubscribers: false,
  autoGrantVipTokensForSharedSubRenewalMessage: false,
  autoGrantVipTokensToSubGifters: false,
  autoGrantVipTokensToGiftRecipients: false,
  autoGrantVipTokensForCheers: false,
  autoGrantVipTokensForChannelPointRewards: false,
  autoGrantVipTokensForRaiders: false,
  autoGrantVipTokensForStreamElementsTips: false,
  allowRequestPathModifiers: false,
  cheerBitsPerVipToken: 200,
  channelPointRewardCost: defaultChannelPointRewardCost,
  vipTokenDurationThresholds: [],
  cheerMinimumTokenPercent: 25,
  raidMinimumViewerCount: 1,
  streamElementsTipAmountPerVipToken: 5,
  duplicateWindowSeconds: 900,
  showPlaylistPositions: false,
  showPickOrderBadges: false,
  commandPrefix: "!sr",
};
const settingsComparisonKeys = Object.keys(defaultForm) as Array<
  keyof DashboardSettingsFormData
>;

const twitchExtensionInstallUrl =
  "https://dashboard.twitch.tv/extensions/gojrfj73vbfx7fww479a77kpvyrz91-0.0.1";
const twitchExtensionBetaUserIds = new Set([
  "152539019",
  "26914244",
  "44932690",
  "49572641",
]);

export const Route = createFileRoute("/dashboard/settings")({
  head: async () => ({
    meta: [
      {
        title: await getLocalizedPageTitle({
          namespace: "dashboard",
          key: "settings.header.title",
        }),
      },
    ],
  }),
  component: DashboardSettingsPage,
});

function DashboardSettingsPage() {
  const { t } = useLocaleTranslation("dashboard");
  const { t: tBot } = useLocaleTranslation("bot");
  const { locale } = useAppLocale();
  const queryClient = useQueryClient();
  const cachedSettingsData = queryClient.getQueryData<DashboardSettingsData>([
    "dashboard-settings",
  ]);
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
    ...viewerSessionQueryOptions,
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
            ? (body.message ?? t("settings.states.failedToLoad"))
            : t("settings.states.failedToLoad")
        );
      }

      return body as DashboardSettingsData;
    },
    enabled: !sessionQuery.isLoading && hasOwnerChannel,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
  const [form, setForm] = useState<DashboardSettingsFormData>(() =>
    cachedSettingsData?.settings
      ? normalizeSettingsFormData(cachedSettingsData.settings)
      : defaultForm
  );
  const [hasHydratedForm, setHasHydratedForm] = useState(
    () => cachedSettingsData !== undefined
  );
  const [officialDlcOpen, setOfficialDlcOpen] = useState(false);
  const [allowedTuningsOpen, setAllowedTuningsOpen] = useState(false);
  const [requiredPathsOpen, setRequiredPathsOpen] = useState(false);

  useEffect(() => {
    if (hasHydratedForm || settingsQuery.data === undefined) {
      return;
    }

    if (settingsQuery.data.settings) {
      setForm(normalizeSettingsFormData(settingsQuery.data.settings));
    }

    setHasHydratedForm(true);
  }, [hasHydratedForm, settingsQuery.data]);

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
            ? (body.message ?? t("settings.states.failedToSave"))
            : t("settings.states.failedToSave")
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
      setSaveError(getErrorMessage(error) || t("settings.states.failedToSave"));
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
    t,
    form.requiredPaths,
    form.requiredPathsMatchMode
  );
  const streamElementsTipRelayUrl =
    settingsQuery.data?.integrations.streamElementsTipRelayUrl ?? null;
  const channelPointRewardsEligibility =
    settingsQuery.data?.channelPointRewardsEligibility ??
    unknownChannelPointRewardEligibility;
  const channelPointRewardsDisabledByEligibility =
    channelPointRewardsEligibility.isKnown &&
    !channelPointRewardsEligibility.isSupported;
  const canEnableChannelPointRewards =
    !channelPointRewardsEligibility.isKnown ||
    channelPointRewardsEligibility.isSupported;
  const showChannelPointRewardDetails =
    form.autoGrantVipTokensForChannelPointRewards &&
    canEnableChannelPointRewards;
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

  function setVipTokenDurationThresholds(
    nextThresholds: DashboardSettingsFormData["vipTokenDurationThresholds"]
  ) {
    setForm((current) => ({
      ...current,
      vipTokenDurationThresholds:
        normalizeVipTokenDurationThresholds(nextThresholds),
    }));
  }

  function updateVipTokenDurationThreshold(
    index: number,
    field: "minimumDurationMinutes" | "tokenCost",
    value: number
  ) {
    setVipTokenDurationThresholds(
      form.vipTokenDurationThresholds.map((threshold, thresholdIndex) =>
        thresholdIndex === index
          ? {
              ...threshold,
              [field]:
                field === "minimumDurationMinutes"
                  ? Math.max(0.01, value || 0)
                  : Math.max(1, Math.trunc(value || 0)),
            }
          : threshold
      )
    );
  }

  function addVipTokenDurationThreshold() {
    setVipTokenDurationThresholds([
      ...form.vipTokenDurationThresholds,
      {
        minimumDurationMinutes: 7,
        tokenCost: form.vipTokenDurationThresholds.length + 1,
      },
    ]);
  }

  function removeVipTokenDurationThreshold(index: number) {
    setVipTokenDurationThresholds(
      form.vipTokenDurationThresholds.filter(
        (_threshold, thresholdIndex) => thresholdIndex !== index
      )
    );
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
        title={t("settings.header.title")}
        description={t("settings.header.description")}
        meta={
          canSeeTwitchExtensionInstall ? (
            <p className="max-w-2xl text-sm leading-7 text-(--muted)">
              {t("settings.header.betaNote")}
            </p>
          ) : null
        }
        actions={
          hasOwnerChannel || canSeeTwitchExtensionInstall ? (
            <div className="flex flex-wrap gap-2">
              {hasOwnerChannel ? (
                <Button asChild variant="outline">
                  <Link to="/dashboard/panel-preview" className="no-underline">
                    {t("settings.header.previewPanel")}
                  </Link>
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
                    {t("settings.header.installExtension")}
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
                {t(`botStatus.${getBotStatusKey(status)}`)}
              </Badge>
            </div>
          ) : null
        }
      />

      {sessionQuery.isLoading ? (
        <Card className="dashboard-settings__section">
          <CardContent className="pt-6">
            <p className="text-sm text-(--muted)">
              {t("settings.states.loadingAccess")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!sessionQuery.isLoading && !hasOwnerChannel ? (
        <Card className="dashboard-settings__section">
          <CardHeader>
            <CardTitle as="h2" className="text-xl leading-tight md:text-2xl">
              {t("settings.ownerOnly.title")}
            </CardTitle>
            <CardDescription>
              {t("settings.ownerOnly.description")}
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
                    <Link
                      to="/$slug"
                      params={{ slug: channel.slug }}
                      className="no-underline"
                    >
                      {t("settings.ownerOnly.openChannel")}
                    </Link>
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-(--muted)">
                {t("settings.ownerOnly.signInHint")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!sessionQuery.isLoading && hasOwnerChannel && settingsQuery.error ? (
        <Banner tone="danger">
          {getErrorMessage(
            settingsQuery.error,
            t("settings.states.failedToLoad")
          )}
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
                    {t("settings.header.title")}
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
                      ? t("settings.states.loading")
                      : saveError
                        ? t("settings.states.saveFailed")
                        : mutation.isPending
                          ? t("settings.states.saving")
                          : hasUnsavedChanges
                            ? t("settings.states.unsavedChanges")
                            : t("settings.states.allChangesSaved")}
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
                    {t("settings.states.saved")}
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
                    {mutation.isPending
                      ? t("settings.states.savingButton")
                      : t("settings.actions.saveSettings")}
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
                  {t("settings.sections.channelSetup.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.channelSetup.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-4">
                  {status === "broadcaster_auth_required" ? (
                    <div className="border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                      {t("settings.sections.channelSetup.reconnectNotice")}{" "}
                      <a
                        href="/auth/twitch/start?redirectTo=%2Fdashboard%2Fsettings"
                        className="font-semibold underline"
                      >
                        {t("settings.actions.reconnectTwitch")}
                      </a>
                      .
                    </div>
                  ) : null}
                  <div className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
                    <h3 className="text-sm font-semibold text-(--text)">
                      {t("settings.sections.channelSetup.mainToggles")}
                    </h3>
                    <PermissionRow
                      label={t("settings.sections.channelSetup.enableBot")}
                      checked={form.botChannelEnabled}
                      onChange={(value) =>
                        setBoolean("botChannelEnabled", value)
                      }
                    />
                    <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                      {t("settings.sections.channelSetup.enableBotHelp")}
                    </div>
                    <PermissionRow
                      label={t("settings.sections.channelSetup.enableRequests")}
                      checked={form.requestsEnabled}
                      onChange={(value) => setBoolean("requestsEnabled", value)}
                    />
                    <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                      {t("settings.sections.channelSetup.enableRequestsHelp")}
                    </div>
                  </div>

                  <div className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
                    <h3 className="text-sm font-semibold text-(--text)">
                      {t("settings.sections.channelSetup.playlistDisplay")}
                    </h3>
                    <PermissionRow
                      label={t("settings.sections.channelSetup.showPositions")}
                      checked={form.showPlaylistPositions}
                      onChange={(value) =>
                        setBoolean("showPlaylistPositions", value)
                      }
                    />
                    <PermissionRow
                      label={t(
                        "settings.sections.channelSetup.showPickOrderBadges"
                      )}
                      checked={form.showPickOrderBadges}
                      onChange={(value) =>
                        setBoolean("showPickOrderBadges", value)
                      }
                    />
                    <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                      {t(
                        "settings.sections.channelSetup.showPickOrderBadgesHelp"
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <FieldBlock
                    label={tBot("dashboard.botLanguage")}
                    description={tBot("dashboard.botLanguageHelp")}
                  >
                    <div className="grid gap-3">
                      <Select
                        value={form.defaultLocale}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            defaultLocale:
                              value as DashboardSettingsFormData["defaultLocale"],
                          }))
                        }
                      >
                        <SelectTrigger
                          aria-label={tBot("dashboard.botLanguage")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {localeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.nativeLabel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TranslationHelpButton align="start" className="w-fit" />
                    </div>
                  </FieldBlock>
                  <FieldBlock
                    label={t("settings.sections.channelSetup.commandPrefix")}
                    description={t(
                      "settings.sections.channelSetup.commandPrefixHelp"
                    )}
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
                    label={t("settings.sections.channelSetup.requestModifiers")}
                    description={t(
                      "settings.sections.channelSetup.requestModifiersHelp"
                    )}
                  >
                    <PermissionRow
                      label={t(
                        "settings.sections.channelSetup.allowBassModifier"
                      )}
                      checked={form.allowRequestPathModifiers}
                      onChange={(value) =>
                        setBoolean("allowRequestPathModifiers", value)
                      }
                    />
                  </FieldBlock>
                  <FieldBlock
                    label={t(
                      "settings.sections.channelSetup.duplicateCooldown"
                    )}
                    description={t(
                      "settings.sections.channelSetup.duplicateCooldownHelp"
                    )}
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
                  {t("settings.sections.requestAccess.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.requestAccess.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <PermissionRow
                  label={t("settings.sections.requestAccess.anyone")}
                  checked={form.allowAnyoneToRequest}
                  onChange={(value) =>
                    setBoolean("allowAnyoneToRequest", value)
                  }
                />
                {!form.allowAnyoneToRequest ? (
                  <>
                    <PermissionRow
                      label={t("settings.sections.requestAccess.subscribers")}
                      checked={form.allowSubscribersToRequest}
                      onChange={(value) =>
                        setBoolean("allowSubscribersToRequest", value)
                      }
                    />
                    <PermissionRow
                      label={t("settings.sections.requestAccess.vips")}
                      checked={form.allowVipsToRequest}
                      onChange={(value) =>
                        setBoolean("allowVipsToRequest", value)
                      }
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  {t("settings.sections.filters.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.filters.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FilterSection
                  title={t("settings.sections.filters.officialDlc.title")}
                  description={t(
                    "settings.sections.filters.officialDlc.description"
                  )}
                  open={officialDlcOpen}
                  onOpenChange={setOfficialDlcOpen}
                >
                  <div className="grid gap-3">
                    <div className="border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
                      {t("settings.sections.filters.officialDlc.notice")}
                    </div>
                    <div className="grid gap-3 border border-(--border) bg-(--panel-muted) p-3">
                      <PermissionRow
                        label={t(
                          "settings.sections.filters.officialDlc.onlyOfficial"
                        )}
                        checked={form.onlyOfficialDlc}
                        onChange={(value) =>
                          setBoolean("onlyOfficialDlc", value)
                        }
                        disabled
                      />
                      <PermissionRow
                        label={t(
                          "settings.sections.filters.officialDlc.onlyOwned"
                        )}
                        checked={false}
                        onChange={() => {}}
                        disabled
                      />
                    </div>

                    <div className="grid gap-3 border border-(--border) bg-(--panel-muted) p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-(--text)">
                          {t(
                            "settings.sections.filters.officialDlc.ownedTitle"
                          )}
                        </p>
                        <Button type="button" variant="outline" disabled>
                          {t("settings.sections.filters.officialDlc.import")}
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
                                {owned
                                  ? t(
                                      "settings.sections.filters.officialDlc.owned"
                                    )
                                  : t(
                                      "settings.sections.filters.officialDlc.notOwned"
                                    )}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </FilterSection>

                <FilterSection
                  title={t("settings.sections.filters.allowedTunings.title")}
                  description={t(
                    "settings.sections.filters.allowedTunings.description"
                  )}
                  open={allowedTuningsOpen}
                  onOpenChange={setAllowedTuningsOpen}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 grid gap-4">
                      {groupTuningOptions(t, tuningOptions).map((group) => (
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
                      {t("settings.sections.filters.allowedTunings.allowAll")}
                    </Button>
                  </div>
                </FilterSection>

                <FilterSection
                  title={t("settings.sections.filters.requiredPaths.title")}
                  description={t(
                    "settings.sections.filters.requiredPaths.description"
                  )}
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
                        {t("settings.sections.filters.requiredPaths.matchAny")}
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
                        {t("settings.sections.filters.requiredPaths.matchAll")}
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
                            {formatPathOptionLabel(t, option)}
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
                  {t("settings.sections.queueLimits.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.queueLimits.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="grid min-w-0 content-start gap-3 border border-(--border) bg-(--panel-soft) p-4">
                  <h3 className="text-sm font-semibold text-(--text)">
                    {t("settings.sections.queueLimits.queueLimits")}
                  </h3>
                  <div className="divide-y divide-(--border)">
                    <CompactNumberRow
                      label={t("settings.sections.queueLimits.maxPlaylist")}
                      value={form.maxQueueSize}
                      onChange={(value) => setNumber("maxQueueSize", value)}
                    />
                    <CompactNumberRow
                      label={t("settings.sections.queueLimits.maxPerViewer")}
                      value={form.maxViewerRequestsAtOnce}
                      onChange={(value) =>
                        setNumber("maxViewerRequestsAtOnce", value)
                      }
                    />
                    <CompactNumberRow
                      label={t(
                        "settings.sections.queueLimits.maxPerSubscriber"
                      )}
                      value={form.maxSubscriberRequestsAtOnce}
                      onChange={(value) =>
                        setNumber("maxSubscriberRequestsAtOnce", value)
                      }
                    />
                    <CompactNumberRow
                      label={t("settings.sections.queueLimits.maxVipPerViewer")}
                      value={form.maxVipViewerRequestsAtOnce}
                      onChange={(value) =>
                        setNumber("maxVipViewerRequestsAtOnce", value)
                      }
                    />
                    <CompactNumberRow
                      label={t(
                        "settings.sections.queueLimits.maxVipPerSubscriber"
                      )}
                      value={form.maxVipSubscriberRequestsAtOnce}
                      onChange={(value) =>
                        setNumber("maxVipSubscriberRequestsAtOnce", value)
                      }
                    />
                  </div>
                </div>

                <div className="grid min-w-0 content-start gap-3 border border-(--border) bg-(--panel-soft) p-4">
                  <h3 className="text-sm font-semibold text-(--text)">
                    {t("settings.sections.queueLimits.rateLimits")}
                  </h3>

                  <div
                    className={`grid gap-3 ${
                      !form.limitRegularRequestsEnabled ? "opacity-70" : ""
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      {t("settings.sections.queueLimits.regular")}
                    </p>
                    <PermissionRow
                      label={t("settings.sections.queueLimits.enableRegular")}
                      checked={form.limitRegularRequestsEnabled}
                      onChange={(value) =>
                        setBoolean("limitRegularRequestsEnabled", value)
                      }
                    />
                    {form.limitRegularRequestsEnabled ? (
                      <div className="divide-y divide-(--border)">
                        <CompactNumberRow
                          label={t(
                            "settings.sections.queueLimits.regularAllowed"
                          )}
                          value={form.regularRequestsPerPeriod}
                          onChange={(value) =>
                            setNumber("regularRequestsPerPeriod", value)
                          }
                        />
                        <CompactNumberRow
                          label={t(
                            "settings.sections.queueLimits.regularPeriod"
                          )}
                          value={form.regularRequestPeriodSeconds}
                          onChange={(value) =>
                            setNumber("regularRequestPeriodSeconds", value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  <div
                    className={`grid gap-3 border-t border-(--border) pt-3 ${
                      !form.limitVipRequestsEnabled ? "opacity-70" : ""
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      {t("settings.sections.queueLimits.vip")}
                    </p>
                    <PermissionRow
                      label={t("settings.sections.queueLimits.enableVip")}
                      checked={form.limitVipRequestsEnabled}
                      onChange={(value) =>
                        setBoolean("limitVipRequestsEnabled", value)
                      }
                    />
                    {form.limitVipRequestsEnabled ? (
                      <div className="mt-3 divide-y divide-(--border)">
                        <CompactNumberRow
                          label={t("settings.sections.queueLimits.vipAllowed")}
                          value={form.vipRequestsPerPeriod}
                          onChange={(value) =>
                            setNumber("vipRequestsPerPeriod", value)
                          }
                        />
                        <CompactNumberRow
                          label={t("settings.sections.queueLimits.vipPeriod")}
                          value={form.vipRequestPeriodSeconds}
                          onChange={(value) =>
                            setNumber("vipRequestPeriodSeconds", value)
                          }
                        />
                      </div>
                    ) : null}
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
                  {t("settings.sections.vipAutomation.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.vipAutomation.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                  <div className="grid min-w-0 gap-4">
                    <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                      <div className="grid gap-1">
                        <h3 className="text-sm font-semibold text-(--text)">
                          {t("settings.sections.vipAutomation.songLength")}
                        </h3>
                        <p className="text-sm leading-6 text-(--muted)">
                          {t("settings.sections.vipAutomation.songLengthHelp")}
                        </p>
                      </div>
                      {form.vipTokenDurationThresholds.length > 0 ? (
                        <div className="grid gap-3">
                          {form.vipTokenDurationThresholds.map(
                            (threshold, index) => (
                              <div
                                key={`${threshold.minimumDurationMinutes}-${threshold.tokenCost}-${index}`}
                                className="grid gap-3 border border-(--border) bg-(--panel-muted) p-3"
                              >
                                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                                  <FieldBlock
                                    label={t(
                                      "settings.sections.vipAutomation.songLengthMinutes"
                                    )}
                                  >
                                    <Input
                                      type="number"
                                      min={0.01}
                                      max={600}
                                      step={0.25}
                                      value={threshold.minimumDurationMinutes}
                                      onChange={(event) =>
                                        updateVipTokenDurationThreshold(
                                          index,
                                          "minimumDurationMinutes",
                                          Number(event.target.value)
                                        )
                                      }
                                    />
                                  </FieldBlock>
                                  <FieldBlock
                                    label={t(
                                      "settings.sections.vipAutomation.songLengthTokens"
                                    )}
                                  >
                                    <Input
                                      type="number"
                                      min={1}
                                      max={100}
                                      step={1}
                                      value={threshold.tokenCost}
                                      onChange={(event) =>
                                        updateVipTokenDurationThreshold(
                                          index,
                                          "tokenCost",
                                          Number(event.target.value)
                                        )
                                      }
                                    />
                                  </FieldBlock>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      removeVipTokenDurationThreshold(index)
                                    }
                                  >
                                    {t(
                                      "settings.sections.vipAutomation.songLengthRemove"
                                    )}
                                  </Button>
                                </div>
                                <p className="text-sm leading-6 text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.songLengthExample",
                                    {
                                      minutes:
                                        formatVipDurationThresholdMinutes(
                                          threshold.minimumDurationMinutes
                                        ),
                                      count: threshold.tokenCost,
                                    }
                                  )}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                          {t("settings.sections.vipAutomation.songLengthEmpty")}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-(--border) bg-(--panel-muted) p-3">
                        <p className="text-sm leading-6 text-(--muted)">
                          {t("settings.sections.vipAutomation.songLengthNote")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addVipTokenDurationThreshold}
                          disabled={
                            form.vipTokenDurationThresholds.length >= 12
                          }
                        >
                          {t("settings.sections.vipAutomation.songLengthAdd")}
                        </Button>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                      <div className="grid gap-1">
                        <h3 className="text-sm font-semibold text-(--text)">
                          {t("settings.sections.vipAutomation.vipCooldown")}
                        </h3>
                        <p className="text-sm leading-6 text-(--muted)">
                          {t("settings.sections.vipAutomation.vipCooldownHelp")}
                        </p>
                      </div>
                      <PermissionRow
                        label={t(
                          "settings.sections.vipAutomation.vipCooldownToggle"
                        )}
                        checked={form.vipRequestCooldownEnabled}
                        onChange={(value) =>
                          setBoolean("vipRequestCooldownEnabled", value)
                        }
                      />
                      {form.vipRequestCooldownEnabled ? (
                        <div className="grid gap-3 border border-dashed border-(--border) bg-(--panel-muted) p-3">
                          <FieldBlock
                            label={t(
                              "settings.sections.vipAutomation.vipCooldownMinutes"
                            )}
                          >
                            <Input
                              type="number"
                              min={1}
                              max={10080}
                              step={1}
                              value={form.vipRequestCooldownMinutes}
                              onChange={(event) =>
                                setNumber(
                                  "vipRequestCooldownMinutes",
                                  Math.max(
                                    0,
                                    Math.trunc(Number(event.target.value) || 0)
                                  )
                                )
                              }
                            />
                          </FieldBlock>
                          <p className="text-sm leading-6 text-(--muted)">
                            {t(
                              "settings.sections.vipAutomation.vipCooldownExample",
                              {
                                minutes: formatSettingsNumber(
                                  locale,
                                  form.vipRequestCooldownMinutes
                                ),
                              }
                            )}
                          </p>
                          <p className="text-sm leading-6 text-(--muted)">
                            {t(
                              "settings.sections.vipAutomation.vipCooldownNote"
                            )}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                      <h3 className="text-sm font-semibold text-(--text)">
                        {t("settings.sections.vipAutomation.subscribes")}
                      </h3>
                      <PermissionRow
                        label={t("settings.sections.vipAutomation.newSub")}
                        checked={form.autoGrantVipTokenToSubscribers}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokenToSubscribers", value)
                        }
                      />
                      <PermissionRow
                        label={t(
                          "settings.sections.vipAutomation.sharedRenewal"
                        )}
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
                      {form.autoGrantVipTokensForSharedSubRenewalMessage ? (
                        <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                          {t(
                            "settings.sections.vipAutomation.sharedRenewalHelp"
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                      <h3 className="text-sm font-semibold text-(--text)">
                        {t("settings.sections.vipAutomation.giftedSubs")}
                      </h3>
                      <PermissionRow
                        label={t("settings.sections.vipAutomation.subGifter")}
                        checked={form.autoGrantVipTokensToSubGifters}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokensToSubGifters", value)
                        }
                      />
                      <PermissionRow
                        label={t(
                          "settings.sections.vipAutomation.subRecipient"
                        )}
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
                        {t("settings.sections.vipAutomation.raids")}
                      </h3>
                      <PermissionRow
                        label={t("settings.sections.vipAutomation.raidReward")}
                        checked={form.autoGrantVipTokensForRaiders}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokensForRaiders", value)
                        }
                      />
                      {form.autoGrantVipTokensForRaiders ? (
                        <>
                          <FieldBlock
                            label={t(
                              "settings.sections.vipAutomation.minimumRaid"
                            )}
                            description={t(
                              "settings.sections.vipAutomation.minimumRaidHelp"
                            )}
                          >
                            <div className="max-w-32">
                              <Input
                                type="number"
                                min={1}
                                value={form.raidMinimumViewerCount}
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
                            {t("settings.sections.vipAutomation.raidNotice")}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid min-w-0 content-start gap-4">
                    <div
                      className={`grid min-w-0 gap-3 border bg-(--panel-soft) p-4 ${
                        showChannelPointRewardDetails
                          ? "border-(--border-strong)"
                          : channelPointRewardsDisabledByEligibility
                            ? "border-amber-500/30"
                            : "border-(--border) opacity-70"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-(--text)">
                        {t("settings.sections.vipAutomation.channelPoints")}
                      </h3>
                      <PermissionRow
                        label={t(
                          "settings.sections.vipAutomation.channelPointsToggle"
                        )}
                        checked={form.autoGrantVipTokensForChannelPointRewards}
                        onChange={(value) => {
                          if (!value) {
                            setBoolean(
                              "autoGrantVipTokensForChannelPointRewards",
                              false
                            );
                            return;
                          }

                          if (canEnableChannelPointRewards) {
                            setBoolean(
                              "autoGrantVipTokensForChannelPointRewards",
                              true
                            );
                          }
                        }}
                        disabled={
                          channelPointRewardsDisabledByEligibility &&
                          !form.autoGrantVipTokensForChannelPointRewards
                        }
                      />
                      {channelPointRewardsDisabledByEligibility ? (
                        <Banner tone="warning">
                          {t(
                            "settings.sections.vipAutomation.channelPointUnavailable"
                          )}
                        </Banner>
                      ) : null}
                      {showChannelPointRewardDetails ? (
                        <div className="grid gap-3">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                            <FieldBlock
                              label={t(
                                "settings.sections.vipAutomation.channelPointCost"
                              )}
                              description={t(
                                "settings.sections.vipAutomation.channelPointCostHelp"
                              )}
                            >
                              <div className="max-w-40">
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={form.channelPointRewardCost}
                                  onChange={(event) =>
                                    setNumber(
                                      "channelPointRewardCost",
                                      Math.max(
                                        1,
                                        Number(event.target.value) || 0
                                      )
                                    )
                                  }
                                />
                              </div>
                            </FieldBlock>
                            <FieldBlock
                              label={t(
                                "settings.sections.vipAutomation.channelPointRewardName"
                              )}
                              description={t(
                                "settings.sections.vipAutomation.channelPointRewardNameHelp"
                              )}
                            >
                              <Input
                                value={vipTokenChannelPointRewardTitle}
                                readOnly
                              />
                            </FieldBlock>
                          </div>
                          <div className="grid gap-2 border border-(--border) bg-(--panel-muted) p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="grid min-w-0 gap-1">
                                <p className="text-sm font-medium text-(--text)">
                                  {t(
                                    "settings.sections.vipAutomation.channelPointSetup"
                                  )}
                                </p>
                                <p className="text-sm leading-6 text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.channelPointSetupHelp"
                                  )}
                                </p>
                              </div>
                              <ChannelPointRewardInstructionsDialog
                                rewardTitle={vipTokenChannelPointRewardTitle}
                              />
                            </div>
                            <p className="text-xs leading-5 text-(--muted)">
                              {t(
                                "settings.sections.vipAutomation.channelPointSetupNote"
                              )}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div
                      className={`grid min-w-0 gap-3 border bg-(--panel-soft) p-4 ${
                        form.autoGrantVipTokensForCheers
                          ? "border-(--border-strong)"
                          : "border-(--border) opacity-70"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-(--text)">
                        {t("settings.sections.vipAutomation.cheers")}
                      </h3>
                      <PermissionRow
                        label={t(
                          "settings.sections.vipAutomation.cheersToggle"
                        )}
                        checked={form.autoGrantVipTokensForCheers}
                        onChange={(value) =>
                          setBoolean("autoGrantVipTokensForCheers", value)
                        }
                      />
                      {form.autoGrantVipTokensForCheers ? (
                        <div className="grid gap-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                            <div className="grid gap-1.5">
                              <p className="text-sm font-medium text-(--text)">
                                {t(
                                  "settings.sections.vipAutomation.cheerConversion"
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="w-24 shrink-0">
                                  <Input
                                    id="cheer-bits-per-vip-token"
                                    type="number"
                                    min={0}
                                    value={form.cheerBitsPerVipToken}
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
                                  {t(
                                    "settings.sections.vipAutomation.bitsPerToken"
                                  )}
                                </label>
                              </div>
                            </div>
                            <div className="grid gap-1.5">
                              <p className="text-sm font-medium text-(--text)">
                                {t(
                                  "settings.sections.vipAutomation.minimumCheer"
                                )}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {[25, 50, 75, 100].map((percent) => (
                                  <button
                                    key={percent}
                                    type="button"
                                    onClick={() =>
                                      setNumber(
                                        "cheerMinimumTokenPercent",
                                        percent as DashboardSettingsFormData["cheerMinimumTokenPercent"]
                                      )
                                    }
                                    className={`border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
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
                              {t("settings.sections.vipAutomation.liveExample")}
                            </p>
                            {form.cheerBitsPerVipToken > 0 ? (
                              <>
                                <p className="text-sm leading-6 text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.minimumCheerExample",
                                    {
                                      bits: formatSettingsNumber(
                                        locale,
                                        cheerMinimumBits
                                      ),
                                      tokenCount: formatSettingsNumber(
                                        locale,
                                        cheerMinimumPartialTokens
                                      ),
                                      percent: form.cheerMinimumTokenPercent,
                                    }
                                  )}
                                </p>
                                <p className="text-sm leading-6 text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.bitsExample",
                                    {
                                      oneTokenBits: formatSettingsNumber(
                                        locale,
                                        form.cheerBitsPerVipToken
                                      ),
                                      fiveTokenBits: formatSettingsNumber(
                                        locale,
                                        form.cheerBitsPerVipToken * 5
                                      ),
                                    }
                                  )}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm leading-6 text-(--muted)">
                                {t(
                                  "settings.sections.vipAutomation.bitsExampleEmpty"
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div
                      className={`grid min-w-0 gap-3 border bg-(--panel-soft) p-4 ${
                        form.autoGrantVipTokensForStreamElementsTips
                          ? "border-(--border-strong)"
                          : "border-(--border) opacity-70"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-(--text)">
                        {t("settings.sections.vipAutomation.tips")}
                      </h3>
                      <PermissionRow
                        label={t("settings.sections.vipAutomation.tipsToggle")}
                        checked={form.autoGrantVipTokensForStreamElementsTips}
                        onChange={(value) =>
                          setBoolean(
                            "autoGrantVipTokensForStreamElementsTips",
                            value
                          )
                        }
                      />
                      {form.autoGrantVipTokensForStreamElementsTips ? (
                        <div className="grid gap-3">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                            <FieldBlock
                              label={t(
                                "settings.sections.vipAutomation.tipAmount"
                              )}
                              description={t(
                                "settings.sections.vipAutomation.tipAmountHelp"
                              )}
                            >
                              <div className="max-w-40">
                                <Input
                                  type="number"
                                  min={0.01}
                                  step={0.01}
                                  value={
                                    form.streamElementsTipAmountPerVipToken
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
                              label={t(
                                "settings.sections.vipAutomation.relayUrl"
                              )}
                              description={t(
                                "settings.sections.vipAutomation.relayUrlHelp"
                              )}
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
                                  {relayUrlCopied
                                    ? t("settings.actions.copied")
                                    : t("settings.actions.copyUrl")}
                                </Button>
                              </div>
                            </FieldBlock>
                          </div>
                          <div className="grid gap-2 border border-(--border) bg-(--panel-muted) p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="grid min-w-0 gap-1">
                                <p className="text-sm font-medium text-(--text)">
                                  {t("settings.sections.vipAutomation.setup")}
                                </p>
                                <p className="text-sm leading-6 text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.setupHelp"
                                  )}
                                </p>
                              </div>
                              <StreamElementsTipInstructionsDialog
                                relayUrl={streamElementsTipRelayUrl}
                              />
                            </div>
                            <p className="text-xs leading-5 text-(--muted)">
                              {t("settings.sections.vipAutomation.setupNote")}
                            </p>
                          </div>
                        </div>
                      ) : null}
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
                  {t("settings.sections.rules.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.rules.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <PermissionRow
                  label={t("settings.sections.rules.enableBlacklist")}
                  checked={form.blacklistEnabled}
                  onChange={(value) => setBoolean("blacklistEnabled", value)}
                />
                <PermissionRow
                  label={t("settings.sections.rules.enableSetlist")}
                  checked={form.setlistEnabled}
                  onChange={(value) => setBoolean("setlistEnabled", value)}
                />
                {form.blacklistEnabled && form.setlistEnabled ? (
                  <PermissionRow
                    label={t("settings.sections.rules.bypassBlacklist")}
                    checked={form.letSetlistBypassBlacklist}
                    onChange={(value) =>
                      setBoolean("letSetlistBypassBlacklist", value)
                    }
                  />
                ) : null}
                {form.setlistEnabled ? (
                  <PermissionRow
                    label={t(
                      "settings.sections.rules.subscribersFollowSetlist"
                    )}
                    checked={form.subscribersMustFollowSetlist}
                    onChange={(value) =>
                      setBoolean("subscribersMustFollowSetlist", value)
                    }
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card className="dashboard-settings__section">
              <CardHeader>
                <CardTitle
                  as="h2"
                  className="text-xl leading-tight md:text-2xl"
                >
                  {t("settings.sections.moderatorPermissions.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.sections.moderatorPermissions.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <PermissionRow
                  label={t(
                    "settings.sections.moderatorPermissions.manageRequests"
                  )}
                  checked={form.moderatorCanManageRequests}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageRequests", value)
                  }
                />
                <PermissionRow
                  label={t(
                    "settings.sections.moderatorPermissions.manageBlacklist"
                  )}
                  checked={form.moderatorCanManageBlacklist}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageBlacklist", value)
                  }
                />
                <PermissionRow
                  label={t(
                    "settings.sections.moderatorPermissions.manageSetlist"
                  )}
                  checked={form.moderatorCanManageSetlist}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageSetlist", value)
                  }
                />
                <PermissionRow
                  label={t(
                    "settings.sections.moderatorPermissions.manageBlockedViewers"
                  )}
                  checked={form.moderatorCanManageBlockedChatters}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageBlockedChatters", value)
                  }
                />
                <PermissionRow
                  label={t(
                    "settings.sections.moderatorPermissions.manageVipTokens"
                  )}
                  checked={form.moderatorCanManageVipTokens}
                  onChange={(value) =>
                    setBoolean("moderatorCanManageVipTokens", value)
                  }
                />
                <PermissionRow
                  label={t("settings.sections.moderatorPermissions.manageTags")}
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

function StreamElementsTipInstructionsDialog(props: {
  relayUrl: string | null;
}) {
  const { t } = useLocaleTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [relayUrlCopied, setRelayUrlCopied] = useState(false);
  const [relayCodeCopied, setRelayCodeCopied] = useState(false);
  const relayCode = props.relayUrl
    ? buildStreamElementsTipRelayCode(props.relayUrl)
    : "";
  const steps = [
    {
      title: t(
        "settings.sections.vipAutomation.instructions.pages.enable.title"
      ),
      body: t("settings.sections.vipAutomation.instructions.pages.enable.body"),
      points: [
        t(
          "settings.sections.vipAutomation.instructions.pages.enable.steps.toggle"
        ),
        t(
          "settings.sections.vipAutomation.instructions.pages.enable.steps.amount"
        ),
        t(
          "settings.sections.vipAutomation.instructions.pages.enable.steps.save"
        ),
      ],
    },
    {
      title: t(
        "settings.sections.vipAutomation.instructions.pages.connect.title"
      ),
      body: t(
        "settings.sections.vipAutomation.instructions.pages.connect.body"
      ),
      points: [
        t(
          "settings.sections.vipAutomation.instructions.pages.connect.steps.open"
        ),
        t(
          "settings.sections.vipAutomation.instructions.pages.connect.steps.connect"
        ),
        t(
          "settings.sections.vipAutomation.instructions.pages.connect.steps.autoConnect"
        ),
        t(
          "settings.sections.vipAutomation.instructions.pages.connect.steps.action"
        ),
      ],
    },
    {
      title: t(
        "settings.sections.vipAutomation.instructions.pages.relay.title"
      ),
      body: t("settings.sections.vipAutomation.instructions.pages.relay.body"),
      points: [
        t(
          "settings.sections.vipAutomation.instructions.pages.relay.steps.subAction"
        ),
        t(
          "settings.sections.vipAutomation.instructions.pages.relay.steps.paste"
        ),
      ],
    },
    {
      title: t("settings.sections.vipAutomation.instructions.pages.test.title"),
      body: t("settings.sections.vipAutomation.instructions.pages.test.body"),
      points: [
        t("settings.sections.vipAutomation.instructions.pages.test.steps.tip"),
        t("settings.sections.vipAutomation.instructions.pages.test.steps.chat"),
        t(
          "settings.sections.vipAutomation.instructions.pages.test.steps.username"
        ),
        t("settings.sections.vipAutomation.instructions.pages.test.steps.obs"),
      ],
    },
  ];
  const currentStep = steps[stepIndex];
  const hasPreviousStep = stepIndex > 0;
  const hasNextStep = stepIndex < steps.length - 1;

  useEffect(() => {
    if (open) {
      return;
    }

    setStepIndex(0);
    setRelayUrlCopied(false);
    setRelayCodeCopied(false);
  }, [open]);

  async function copyRelayUrl() {
    if (!props.relayUrl) {
      return;
    }

    await navigator.clipboard.writeText(props.relayUrl);
    setRelayUrlCopied(true);
    window.setTimeout(() => {
      setRelayUrlCopied(false);
    }, 1500);
  }

  async function copyRelayCode() {
    if (!relayCode) {
      return;
    }

    await navigator.clipboard.writeText(relayCode);
    setRelayCodeCopied(true);
    window.setTimeout(() => {
      setRelayCodeCopied(false);
    }, 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!props.relayUrl}
          className="shrink-0"
        >
          {t("settings.actions.instructions")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-(--panel-strong) sm:max-w-3xl">
        <DialogHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
            {t("settings.sections.vipAutomation.instructions.progress", {
              current: stepIndex + 1,
              total: steps.length,
            })}
          </p>
          <DialogTitle>
            {t("settings.sections.vipAutomation.instructions.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.sections.vipAutomation.instructions.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-(--text)">
                {currentStep.title}
              </h3>
              <p className="text-sm leading-6 text-(--muted)">
                {currentStep.body}
              </p>
            </div>
            <ol className="grid gap-2 pl-5 text-sm leading-6 text-(--muted) list-decimal">
              {currentStep.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ol>
          </section>

          {stepIndex === 2 ? (
            <>
              <section className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
                <div className="grid gap-1">
                  <p className="text-sm font-semibold text-(--text)">
                    {t(
                      "settings.sections.vipAutomation.instructions.pages.relay.webhookLabel"
                    )}
                  </p>
                  <p className="text-sm leading-6 text-(--muted)">
                    {t(
                      "settings.sections.vipAutomation.instructions.pages.relay.webhookHelp"
                    )}
                  </p>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
                  <Input
                    value={props.relayUrl ?? ""}
                    readOnly
                    disabled={!props.relayUrl}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyRelayUrl}
                    disabled={!props.relayUrl}
                    className="self-stretch"
                  >
                    <Copy className="h-4 w-4" />
                    {relayUrlCopied
                      ? t("settings.actions.copied")
                      : t("settings.actions.copyUrl")}
                  </Button>
                </div>
              </section>

              <section className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <p className="text-sm font-semibold text-(--text)">
                      {t(
                        "settings.sections.vipAutomation.instructions.pages.relay.codeLabel"
                      )}
                    </p>
                    <p className="text-sm leading-6 text-(--muted)">
                      {t(
                        "settings.sections.vipAutomation.instructions.pages.relay.codeHelp"
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyRelayCode}
                    disabled={!relayCode}
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                    {relayCodeCopied
                      ? t("settings.actions.copied")
                      : t("settings.actions.copyCode")}
                  </Button>
                </div>
                <pre className="overflow-x-auto border border-dashed border-(--border-strong) bg-(--bg) p-4 text-xs leading-6 text-(--text)">
                  <code>{relayCode}</code>
                </pre>
              </section>
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStepIndex((current) => Math.max(0, current - 1));
            }}
            disabled={!hasPreviousStep}
          >
            {t("settings.actions.previous")}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                {t("settings.actions.done")}
              </Button>
            </DialogClose>
            {hasNextStep ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setStepIndex((current) =>
                    Math.min(steps.length - 1, current + 1)
                  );
                }}
              >
                {t("settings.actions.next")}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const { t } = useLocaleTranslation("dashboard");

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
            {props.open
              ? t("settings.actions.hide")
              : t("settings.actions.show")}
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

function formatSettingsNumber(locale: string, value: number) {
  return formatNumber(locale as never, value, {
    maximumFractionDigits: 2,
  });
}

function ChannelPointRewardInstructionsDialog(props: { rewardTitle: string }) {
  const { t } = useLocaleTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = [
    {
      title: t(
        "settings.sections.vipAutomation.channelPointInstructions.pages.enable.title"
      ),
      body: t(
        "settings.sections.vipAutomation.channelPointInstructions.pages.enable.body"
      ),
      points: [
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.enable.steps.toggle"
        ),
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.enable.steps.cost"
        ),
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.enable.steps.save"
        ),
      ],
    },
    {
      title: t(
        "settings.sections.vipAutomation.channelPointInstructions.pages.reconnect.title"
      ),
      body: t(
        "settings.sections.vipAutomation.channelPointInstructions.pages.reconnect.body"
      ),
      points: [
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.reconnect.steps.notice"
        ),
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.reconnect.steps.signIn"
        ),
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.reconnect.steps.saveAgain"
        ),
      ],
    },
    {
      title: t(
        "settings.sections.vipAutomation.channelPointInstructions.pages.check.title"
      ),
      body: t(
        "settings.sections.vipAutomation.channelPointInstructions.pages.check.body"
      ),
      points: [
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.check.steps.reward"
        ),
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.check.steps.live"
        ),
        t(
          "settings.sections.vipAutomation.channelPointInstructions.pages.check.steps.fulfill"
        ),
      ],
    },
  ];
  const currentStep = steps[stepIndex];
  const hasPreviousStep = stepIndex > 0;
  const hasNextStep = stepIndex < steps.length - 1;

  useEffect(() => {
    if (open) {
      return;
    }

    setStepIndex(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          {t("settings.actions.instructions")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-(--panel-strong) sm:max-w-2xl">
        <DialogHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
            {t(
              "settings.sections.vipAutomation.channelPointInstructions.progress",
              {
                current: stepIndex + 1,
                total: steps.length,
              }
            )}
          </p>
          <DialogTitle>
            {t(
              "settings.sections.vipAutomation.channelPointInstructions.title"
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              "settings.sections.vipAutomation.channelPointInstructions.description"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-(--text)">
                {currentStep.title}
              </h3>
              <p className="text-sm leading-6 text-(--muted)">
                {currentStep.body}
              </p>
            </div>
            <ol className="grid gap-2 pl-5 text-sm leading-6 text-(--muted) list-decimal">
              {currentStep.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ol>
          </section>

          {stepIndex === steps.length - 1 ? (
            <section className="grid gap-3 border border-(--border) bg-(--panel-soft) p-4">
              <div className="grid gap-1">
                <p className="text-sm font-semibold text-(--text)">
                  {t(
                    "settings.sections.vipAutomation.channelPointInstructions.rewardNameLabel"
                  )}
                </p>
                <p className="text-sm leading-6 text-(--muted)">
                  {t(
                    "settings.sections.vipAutomation.channelPointInstructions.rewardNameHelp"
                  )}
                </p>
              </div>
              <Input value={props.rewardTitle} readOnly />
            </section>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStepIndex((current) => Math.max(0, current - 1));
            }}
            disabled={!hasPreviousStep}
          >
            {t("settings.actions.previous")}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                {t("settings.actions.done")}
              </Button>
            </DialogClose>
            {hasNextStep ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setStepIndex((current) =>
                    Math.min(steps.length - 1, current + 1)
                  );
                }}
              >
                {t("settings.actions.next")}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizeSettingsFormData(
  settings: DashboardSettingsFormData
): DashboardSettingsFormData {
  return {
    ...settings,
    allowedTunings: settings.allowedTunings.length
      ? settings.allowedTunings
      : allTuningOptions,
    vipRequestCooldownEnabled: settings.vipRequestCooldownEnabled ?? false,
    vipRequestCooldownMinutes: settings.vipRequestCooldownMinutes ?? 0,
    showPickOrderBadges: settings.showPickOrderBadges ?? false,
    vipTokenDurationThresholds: normalizeVipTokenDurationThresholds(
      settings.vipTokenDurationThresholds ?? []
    ),
    moderatorCanViewVipTokens: true,
  };
}

function getSettingsComparisonSnapshot(settings: DashboardSettingsFormData) {
  const normalized = normalizeSettingsFormData(settings);
  const comparable = Object.fromEntries(
    settingsComparisonKeys.map((key) => [key, normalized[key]])
  ) as DashboardSettingsFormData;

  return JSON.stringify({
    ...comparable,
    allowedTunings: [...comparable.allowedTunings].sort(),
    requiredPaths: [...comparable.requiredPaths].sort(),
  });
}

function formatPathOptionLabel(t: (key: string) => string, value: string) {
  return value === "voice"
    ? t("settings.sections.filters.requiredPaths.paths.lyrics")
    : value;
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
  t: (key: string, options?: Record<string, unknown>) => string,
  requiredPaths: string[],
  matchMode: "any" | "all"
) {
  const extraPath = getExampleExtraPath(requiredPaths);

  if (requiredPaths.length === 0) {
    return {
      summary: t("settings.sections.filters.requiredPaths.none"),
      example: null,
    };
  }

  if (requiredPaths.length === 1) {
    return {
      summary: (
        <>
          {t("settings.sections.filters.requiredPaths.singlePrefix")}{" "}
          {renderPathLabel(t, requiredPaths[0])}.{" "}
          {t("settings.sections.filters.requiredPaths.singleSuffix")}
        </>
      ),
      example: (
        <>
          {t("settings.sections.filters.requiredPaths.exampleLabel")}{" "}
          {renderPathExampleSequence(
            t,
            extraPath ? [requiredPaths[0], extraPath] : [requiredPaths[0]]
          )}{" "}
          {t("settings.sections.filters.requiredPaths.singleExample")}
        </>
      ),
    };
  }

  if (matchMode === "any") {
    const selectedPath = requiredPaths[1] ?? requiredPaths[0];
    return {
      summary: (
        <>
          {t("settings.sections.filters.requiredPaths.matchAnyPrefix")}{" "}
          {renderPathSummaryList(t, requiredPaths)}.{" "}
          {t("settings.sections.filters.requiredPaths.matchAnySuffix")}
        </>
      ),
      example: (
        <>
          {t("settings.sections.filters.requiredPaths.exampleLabel")}{" "}
          {renderPathExampleSequence(
            t,
            extraPath ? [selectedPath, extraPath] : [selectedPath]
          )}{" "}
          {t("settings.sections.filters.requiredPaths.matchAnyExample")}
        </>
      ),
    };
  }

  return {
    summary: (
      <>
        {t("settings.sections.filters.requiredPaths.matchAllPrefix")}{" "}
        {renderPathSummaryList(t, requiredPaths)}.{" "}
        {t("settings.sections.filters.requiredPaths.matchAllSuffix")}
      </>
    ),
    example: (
      <>
        {t("settings.sections.filters.requiredPaths.exampleLabel")}{" "}
        {renderPathExampleSequence(
          t,
          extraPath ? [...requiredPaths, extraPath] : requiredPaths
        )}{" "}
        {t("settings.sections.filters.requiredPaths.matchAllExample")}
      </>
    ),
  };
}

function renderPathExampleSequence(
  t: (key: string) => string,
  values: string[]
) {
  const content: ReactNode[] = [];

  values.forEach((value, index) => {
    if (index > 0) {
      content.push(
        <span key={`separator-${index}`} className="text-(--muted)">
          {" + "}
        </span>
      );
    }

    content.push(renderPathExampleLabel(t, value, "", `${value}-${index}`));
  });

  return content;
}

function renderPathSummaryList(t: (key: string) => string, values: string[]) {
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

    content.push(renderPathLabel(t, value, "", `summary-${value}-${index}`));
  });

  return content;
}

function renderPathLabel(
  t: (key: string) => string,
  value: string,
  suffix = "",
  key?: string
) {
  return (
    <span
      key={key}
      className={`font-semibold uppercase tracking-[0.18em] ${getPathExampleTone(
        value
      )}`}
    >
      {formatPathOptionLabel(t, value).toUpperCase()}
      {suffix}
    </span>
  );
}

function renderPathExampleLabel(
  t: (key: string) => string,
  value: string,
  suffix = "",
  key?: string
) {
  return renderPathLabel(t, value, suffix, key);
}

function getExampleExtraPath(requiredPaths: string[]) {
  return pathOptions.find((option) => !requiredPaths.includes(option));
}

function groupTuningOptions(
  t: (key: string) => string,
  options: readonly string[]
) {
  const groups = new Map<string, string[]>();

  for (const option of options) {
    const group = getTuningGroupLabel(t, option);
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

function getTuningGroupLabel(t: (key: string) => string, option: string) {
  if (option.startsWith("Open ")) {
    return t("settings.sections.filters.allowedTunings.groups.open");
  }

  if (option === "Octave" || option === "Celtic" || option === "Other") {
    return t("settings.sections.filters.allowedTunings.groups.other");
  }

  if (option.startsWith("High F") || option.startsWith("Low F")) {
    return "F";
  }

  if (option.startsWith("Low G")) {
    return "G";
  }

  const [
    firstToken = t("settings.sections.filters.allowedTunings.groups.other"),
  ] = option.split(" ");

  if (firstToken === "Drop") {
    return "D";
  }

  return (
    firstToken.replace(/[^A-G]/g, "") ||
    t("settings.sections.filters.allowedTunings.groups.other")
  );
}
