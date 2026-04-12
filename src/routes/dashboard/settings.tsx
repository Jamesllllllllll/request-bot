// Route: Renders request behavior and channel configuration settings.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Coins,
  Copy,
  Filter,
  Gauge,
  LayoutGrid,
  Monitor,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { OverlaySettingsPanel } from "~/components/overlay-settings-panel";
import { PickOrderBadge } from "~/components/pick-order-badge";
import { StatusToggleBadge } from "~/components/status-toggle-badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getBotStatusKey } from "~/lib/bot-status";
import { buildChannelInstructions } from "~/lib/channel-instructions";
import { pathOptions } from "~/lib/channel-options";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { formatNumber } from "~/lib/i18n/format";
import { defaultLocale, localeOptions } from "~/lib/i18n/locales";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";
import {
  createEmptyRequestPathModifierVipTokenCosts,
  getRequestPathModifierVipTokenCostsSetting,
  legacyRequestPathModifierOptions,
  normalizeAllowedRequestPaths,
} from "~/lib/request-policy";
import { requestPathOptions } from "~/lib/requested-paths";
import { DEFAULT_MAX_QUEUE_SIZE } from "~/lib/settings-defaults";
import { buildStreamElementsTipRelayCode } from "~/lib/streamelements/instructions";
import {
  allKnownTuningIds,
  allKnownTuningOptions,
  type TuningOption,
} from "~/lib/tunings";
import type { ChannelPointRewardEligibility } from "~/lib/twitch/channel-point-reward-eligibility";
import { unknownChannelPointRewardEligibility } from "~/lib/twitch/channel-point-reward-eligibility";
import {
  defaultChannelPointRewardCost,
  vipTokenChannelPointRewardTitle,
} from "~/lib/twitch/channel-point-rewards";
import { cn, getErrorMessage } from "~/lib/utils";
import type { SettingsInputData } from "~/lib/validation";
import { viewerSessionQueryOptions } from "~/lib/viewer-session-query";
import {
  formatVipDurationThresholdMinutes,
  getNextVipTokenDurationThreshold,
  normalizeVipTokenDurationThresholds,
} from "~/lib/vip-token-duration-thresholds";

type DashboardSettingsFormData = Omit<
  SettingsInputData,
  "allowedTunings" | "requiredPaths"
> & {
  allowedTunings: number[];
  requiredPaths: string[];
};

type DashboardSettingsData = {
  channel: {
    isLive: boolean;
    botEnabled: boolean;
    botReadyState: string;
  };
  settings: DashboardSettingsFormData | null;
  tuningOptions: TuningOption[];
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

type SettingsTabValue =
  | "general"
  | "requestAccess"
  | "vipCosts"
  | "requestModifiers"
  | "filters"
  | "limits"
  | "rewards"
  | "moderation"
  | "overlay";

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
  allowedTunings: allKnownTuningIds,
  allowedRequestPaths: [],
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
  requestPathModifierVipTokenCost: 0,
  requestPathModifierVipTokenCosts:
    createEmptyRequestPathModifierVipTokenCosts(),
  requestPathModifierUsesVipPriority: false,
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
  "25316876",
  "47941327",
  "78546479",
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
  const { t: tPlaylist } = useLocaleTranslation("playlist");
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
  const saveBatchRef = useRef<{
    remaining: number;
    hasError: boolean;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabValue>("general");
  const [overlaySaveSignal, setOverlaySaveSignal] = useState(0);
  const [overlayHasUnsavedChanges, setOverlayHasUnsavedChanges] =
    useState(false);
  const [overlayIsSaving, setOverlayIsSaving] = useState(false);
  const [overlaySaveError, setOverlaySaveError] = useState<string | null>(null);
  const [channelInstructionsCopied, setChannelInstructionsCopied] =
    useState(false);
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

  function resetSaveFeedback() {
    setSaveWarning(null);
    setSaveError(null);
    setOverlaySaveError(null);
    setSavedIndicatorPhase("hidden");
  }

  function startSaveBatch(count: number) {
    if (count <= 0) {
      saveBatchRef.current = null;
      return;
    }

    saveBatchRef.current = {
      remaining: count,
      hasError: false,
    };
  }

  function finishSaveBatch(success: boolean) {
    const currentBatch = saveBatchRef.current;

    if (!currentBatch) {
      if (success) {
        setSavedIndicatorPhase("visible");
      }

      return;
    }

    currentBatch.remaining -= 1;
    currentBatch.hasError = currentBatch.hasError || !success;

    if (currentBatch.remaining > 0) {
      return;
    }

    const shouldShowSaved = !currentBatch.hasError;
    saveBatchRef.current = null;

    if (shouldShowSaved) {
      setSavedIndicatorPhase("visible");
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...normalizeSettingsFormData(form),
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
      finishSaveBatch(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }),
      ]);
    },
    onError: (error) => {
      setSaveError(getErrorMessage(error) || t("settings.states.failedToSave"));
      finishSaveBatch(false);
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
  const channelHasUnsavedChanges = savedSettings
    ? getSettingsComparisonSnapshot(form) !==
      getSettingsComparisonSnapshot(savedSettings)
    : false;
  const hasUnsavedChanges =
    channelHasUnsavedChanges || overlayHasUnsavedChanges;
  const isSavingSettings = mutation.isPending || overlayIsSaving;
  const combinedSaveError = saveError ?? overlaySaveError;
  const canSaveSettings =
    hasOwnerChannel &&
    !settingsQuery.isLoading &&
    !settingsQuery.error &&
    hasUnsavedChanges &&
    !isSavingSettings;
  const activeSaveNotice = combinedSaveError
    ? {
        tone: "danger" as const,
        message: combinedSaveError,
      }
    : saveWarning
      ? {
          tone: "warning" as const,
          message: saveWarning,
        }
      : null;
  const reserveSaveNoticeSpace = !!saveWarning || !!combinedSaveError;
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
  const settingsTabs = [
    {
      value: "general" as const,
      label: t("settings.tabs.general.label"),
      icon: LayoutGrid,
    },
    {
      value: "requestAccess" as const,
      label: t("settings.tabs.access.label"),
      icon: Users,
    },
    {
      value: "filters" as const,
      label: t("settings.tabs.filters.label"),
      icon: Filter,
    },
    {
      value: "limits" as const,
      label: t("settings.tabs.limits.label"),
      icon: Gauge,
    },
    {
      value: "rewards" as const,
      label: t("settings.tabs.rewards.label"),
      icon: Sparkles,
    },
    {
      value: "vipCosts" as const,
      label: t("settings.tabs.vipCosts.label"),
      icon: Coins,
    },
    {
      value: "requestModifiers" as const,
      label: t("settings.tabs.requestModifiers.label"),
      icon: Coins,
    },
    {
      value: "moderation" as const,
      label: t("settings.tabs.moderation.label"),
      icon: Shield,
    },
    {
      value: "overlay" as const,
      label: t("settings.tabs.overlay.label"),
      icon: Monitor,
    },
  ];

  function handleOverlayStateChange(nextState: {
    hasUnsavedChanges: boolean;
    isSaving: boolean;
  }) {
    setOverlayHasUnsavedChanges(nextState.hasUnsavedChanges);
    setOverlayIsSaving(nextState.isSaving);
  }

  function handleOverlaySaveSuccess() {
    setOverlaySaveError(null);
    finishSaveBatch(true);
  }

  function handleOverlaySaveError(message: string) {
    setOverlaySaveError(message);
    finishSaveBatch(false);
  }

  function handleSaveAllChanges() {
    const saveCount =
      Number(channelHasUnsavedChanges) + Number(overlayHasUnsavedChanges);

    if (saveCount === 0) {
      return;
    }

    resetSaveFeedback();
    startSaveBatch(saveCount);

    if (channelHasUnsavedChanges) {
      mutation.mutate();
    }

    if (overlayHasUnsavedChanges) {
      setOverlaySaveSignal((current) => current + 1);
    }
  }

  const availableTuningOptions =
    settingsQuery.data?.tuningOptions ??
    cachedSettingsData?.tuningOptions ??
    allKnownTuningOptions;

  function toggleArrayValue<T extends string | number>(list: T[], value: T) {
    return list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value];
  }

  function toggleAllowedTuning(tuningId: number) {
    setForm((current) => ({
      ...current,
      allowedTunings: toggleArrayValue(current.allowedTunings, tuningId),
    }));
  }

  function toggleAllowedRequestPath(path: (typeof requestPathOptions)[number]) {
    setForm((current) => {
      const nextAllowedRequestPaths = toggleArrayValue(
        current.allowedRequestPaths,
        path
      );
      const nextRequestPathModifierVipTokenCost =
        getLegacyRequestPathModifierVipTokenCost({
          allowedRequestPaths: nextAllowedRequestPaths,
          requestPathModifierVipTokenCosts:
            current.requestPathModifierVipTokenCosts,
        });

      return {
        ...current,
        allowedRequestPaths: nextAllowedRequestPaths,
        requestPathModifierVipTokenCost: nextRequestPathModifierVipTokenCost,
      };
    });
  }

  function setRequestPathModifierVipTokenCost(
    path: (typeof requestPathOptions)[number],
    value: number
  ) {
    setForm((current) => {
      const nextRequestPathModifierVipTokenCosts = {
        ...current.requestPathModifierVipTokenCosts,
        [path]: Math.max(0, Math.trunc(value || 0)),
      };

      return {
        ...current,
        requestPathModifierVipTokenCosts: nextRequestPathModifierVipTokenCosts,
        requestPathModifierVipTokenCost:
          getLegacyRequestPathModifierVipTokenCost({
            allowedRequestPaths: current.allowedRequestPaths,
            requestPathModifierVipTokenCosts:
              nextRequestPathModifierVipTokenCosts,
          }),
      };
    });
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
      vipTokenDurationThresholds: nextThresholds,
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
      getNextVipTokenDurationThreshold(form.vipTokenDurationThresholds),
    ]);
  }

  function removeVipTokenDurationThreshold(index: number) {
    setVipTokenDurationThresholds(
      form.vipTokenDurationThresholds.filter(
        (_threshold, thresholdIndex) => thresholdIndex !== index
      )
    );
  }

  const channelInstructions = buildChannelInstructions({
    channelSlug: viewer?.channel?.slug,
    settings: form,
    locale,
    translate: t,
  });

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

  async function copyChannelInstructions() {
    await navigator.clipboard.writeText(channelInstructions);
    setChannelInstructionsCopied(true);
    window.setTimeout(() => {
      setChannelInstructionsCopied(false);
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
        <div className="grid gap-6">
          <div className="sticky top-3 z-20">
            <div
              className={`surface-grid surface-noise flex items-start justify-between gap-3 border px-4 py-3 backdrop-blur-sm transition-colors sm:items-center ${
                combinedSaveError
                  ? "border-red-500/40 bg-red-500/10"
                  : isSavingSettings || hasUnsavedChanges
                    ? "border-(--brand) bg-(--panel) shadow-(--glow)"
                    : "border-(--border-strong) bg-(--panel-soft)"
              }`}
            >
              <div className="min-w-0 flex-1 grid gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                  {t("settings.header.title")}
                </p>
                <p
                  className={`text-sm font-medium ${
                    combinedSaveError
                      ? "text-red-200"
                      : isSavingSettings || hasUnsavedChanges
                        ? "text-(--text)"
                        : "text-(--muted)"
                  }`}
                >
                  {settingsQuery.isLoading
                    ? t("settings.states.loading")
                    : combinedSaveError
                      ? t("settings.states.saveFailed")
                      : isSavingSettings
                        ? t("settings.states.saving")
                        : hasUnsavedChanges
                          ? t("settings.states.unsavedChanges")
                          : t("settings.states.allChangesSaved")}
                </p>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  onClick={handleSaveAllChanges}
                  disabled={!canSaveSettings}
                  variant={
                    hasUnsavedChanges || isSavingSettings
                      ? "default"
                      : "outline"
                  }
                  className="order-1 h-9 px-3.5 text-sm sm:order-2 sm:h-11 sm:px-5 sm:text-base"
                >
                  {isSavingSettings
                    ? t("settings.states.savingButton")
                    : t("settings.actions.saveSettings")}
                </Button>
                <div className="order-2 flex h-4 items-center justify-end sm:order-1 sm:h-auto">
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
                </div>
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

          <Tabs
            orientation="vertical"
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SettingsTabValue)}
            className="flex-col gap-6 min-[961px]:grid min-[961px]:grid-cols-[15rem_minmax(0,1fr)] min-[961px]:items-start"
          >
            <div className="min-[961px]:sticky min-[961px]:top-24 min-[961px]:w-[15rem] min-[961px]:self-start">
              <TabsList className="!grid h-auto w-full grid-cols-2 gap-2 rounded-[12px] border border-(--border) bg-(--panel-soft) p-2 sm:grid-cols-3 min-[961px]:!flex min-[961px]:max-h-[calc(100dvh-8rem)] min-[961px]:!w-[15rem] min-[961px]:!flex-col min-[961px]:!flex-nowrap min-[961px]:overflow-y-auto min-[961px]:rounded-[14px] min-[961px]:bg-(--panel) min-[961px]:p-2.5">
                {settingsTabs.map((tab) => {
                  const Icon = tab.icon;

                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="h-auto min-h-11 w-full items-center justify-start gap-2 rounded-[10px] border border-transparent bg-transparent px-3 py-3 text-left normal-case tracking-normal whitespace-normal text-(--muted) shadow-none after:hidden data-[state=active]:border-(--border-strong) data-[state=active]:bg-(--panel) data-[state=active]:text-(--text) min-[961px]:min-h-12 min-[961px]:px-3.5"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-current">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{tab.label}</span>
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="grid gap-6">
              <TabsContent
                value="general"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
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
                  <CardContent className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
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
                      <SettingsSubsection
                        title={t("settings.sections.channelSetup.mainToggles")}
                      >
                        <div className="grid gap-3">
                          <StatusToggleBadge
                            enabled={form.botChannelEnabled}
                            toneClassName={
                              form.botChannelEnabled
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-400/30 bg-slate-500/10 text-slate-100"
                            }
                            enabledLabel={tPlaylist("management.bot.enabled")}
                            disabledLabel={tPlaylist("management.bot.disabled")}
                            toggleAriaLabel={tPlaylist(
                              "management.bot.toggleAria"
                            )}
                            onToggle={() =>
                              setBoolean(
                                "botChannelEnabled",
                                !form.botChannelEnabled
                              )
                            }
                          />
                          <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                            {t("settings.sections.channelSetup.enableBotHelp")}
                          </div>
                        </div>
                        <div className="grid gap-3">
                          <StatusToggleBadge
                            enabled={form.requestsEnabled}
                            toneClassName={
                              form.requestsEnabled
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                                : "border-rose-500/30 bg-rose-500/10 text-rose-100"
                            }
                            enabledLabel={tPlaylist("badges.requestsOn")}
                            disabledLabel={tPlaylist("badges.requestsOff")}
                            toggleAriaLabel={
                              form.requestsEnabled
                                ? tPlaylist("badges.turnRequestsOff")
                                : tPlaylist("badges.turnRequestsOn")
                            }
                            onToggle={() =>
                              setBoolean(
                                "requestsEnabled",
                                !form.requestsEnabled
                              )
                            }
                          />
                          <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                            {t(
                              "settings.sections.channelSetup.enableRequestsHelp"
                            )}
                          </div>
                        </div>
                      </SettingsSubsection>

                      <SettingsSubsection
                        title={t(
                          "settings.sections.channelSetup.playlistDisplay"
                        )}
                      >
                        <PermissionRow
                          label={t(
                            "settings.sections.channelSetup.showPositions"
                          )}
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
                        <div className="flex flex-wrap items-center gap-2 border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                          <span>
                            {t(
                              "settings.sections.channelSetup.showPickOrderBadgesHelpBefore"
                            )}
                          </span>
                          <PickOrderBadge pickNumber={1} className="shrink-0" />
                          <span>
                            {t(
                              "settings.sections.channelSetup.showPickOrderBadgesHelpBetween"
                            )}
                          </span>
                          <PickOrderBadge pickNumber={2} className="shrink-0" />
                          <span>
                            {t(
                              "settings.sections.channelSetup.showPickOrderBadgesHelpAfter"
                            )}
                          </span>
                        </div>
                      </SettingsSubsection>
                    </div>

                    <div className="grid gap-4">
                      <SettingsSubsection
                        title={t("settings.sections.channelSetup.chatDefaults")}
                        description={t(
                          "settings.sections.channelSetup.chatDefaultsHelp"
                        )}
                      >
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
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.nativeLabel}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <TranslationHelpButton
                              align="start"
                              className="w-fit"
                            />
                          </div>
                        </FieldBlock>
                        <FieldBlock
                          label={t(
                            "settings.sections.channelSetup.commandPrefix"
                          )}
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
                              value={Math.floor(
                                form.duplicateWindowSeconds / 60
                              )}
                              onChange={(event) =>
                                setNumber(
                                  "duplicateWindowSeconds",
                                  (Number(event.target.value) || 0) * 60
                                )
                              }
                            />
                          </div>
                        </FieldBlock>
                      </SettingsSubsection>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="requestAccess"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
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
                          label={t(
                            "settings.sections.requestAccess.subscribers"
                          )}
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
              </TabsContent>

              <TabsContent
                value="vipCosts"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
                <Card className="dashboard-settings__section">
                  <CardHeader>
                    <CardTitle
                      as="h2"
                      className="text-xl leading-tight md:text-2xl"
                    >
                      {t("settings.sections.vipAutomation.songLength")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.sections.vipAutomation.songLengthHelp")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid max-w-2xl gap-4">
                    {form.vipTokenDurationThresholds.length > 0 ? (
                      <div className="grid gap-3">
                        {form.vipTokenDurationThresholds.map(
                          (threshold, index) => (
                            <div
                              key={index}
                              className="flex flex-wrap items-end gap-3 border border-(--border) bg-(--panel-soft) p-3"
                            >
                              <div className="grid gap-1.5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.songLengthMinutes"
                                  )}
                                </p>
                                <Input
                                  type="number"
                                  min={0.01}
                                  max={600}
                                  step={0.25}
                                  className="h-9 w-24"
                                  value={threshold.minimumDurationMinutes}
                                  onChange={(event) =>
                                    updateVipTokenDurationThreshold(
                                      index,
                                      "minimumDurationMinutes",
                                      Number(event.target.value)
                                    )
                                  }
                                />
                              </div>
                              <div className="grid gap-1.5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                  {t(
                                    "settings.sections.vipAutomation.songLengthTokens"
                                  )}
                                </p>
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  step={1}
                                  className="h-9 w-20"
                                  value={threshold.tokenCost}
                                  onChange={(event) =>
                                    updateVipTokenDurationThreshold(
                                      index,
                                      "tokenCost",
                                      Number(event.target.value)
                                    )
                                  }
                                />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9"
                                onClick={() =>
                                  removeVipTokenDurationThreshold(index)
                                }
                              >
                                {t(
                                  "settings.sections.vipAutomation.songLengthRemove"
                                )}
                              </Button>
                              <p className="basis-full text-xs leading-5 text-(--muted)">
                                {t(
                                  "settings.sections.vipAutomation.songLengthExample",
                                  {
                                    minutes: formatVipDurationThresholdMinutes(
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
                        size="sm"
                        onClick={addVipTokenDurationThreshold}
                        disabled={form.vipTokenDurationThresholds.length >= 12}
                      >
                        {t("settings.sections.vipAutomation.songLengthAdd")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="requestModifiers"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
                <Card className="dashboard-settings__section">
                  <CardHeader>
                    <CardTitle
                      as="h2"
                      className="text-xl leading-tight md:text-2xl"
                    >
                      {t("settings.sections.channelSetup.requestModifiers")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.sections.channelSetup.requestModifiersHelp")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <SettingsSubsection
                      title={t(
                        "settings.sections.channelSetup.allowedPathModifiers"
                      )}
                      className="max-w-2xl"
                    >
                      <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                        <p>
                          {t(
                            "settings.sections.channelSetup.requestModifiersPreamble"
                          )}
                        </p>
                      </div>
                      <PermissionRow
                        label={t(
                          "settings.sections.channelSetup.requestModifiersToggle"
                        )}
                        checked={form.allowRequestPathModifiers}
                        onChange={(value) =>
                          setBoolean("allowRequestPathModifiers", value)
                        }
                        className="max-w-xl"
                      />
                      {form.allowRequestPathModifiers ? (
                        <>
                          <div className="max-w-xl text-sm leading-6 text-(--muted)">
                            {t(
                              "settings.sections.channelSetup.pathModifierVipTokenCostHelp"
                            )}
                          </div>
                          <div className="grid max-w-xl gap-2">
                            {requestPathOptions.map((path) => {
                              const enabled =
                                form.allowedRequestPaths.includes(path);
                              const checkboxId = `request-path-modifier-${path}`;

                              return (
                                <label
                                  key={path}
                                  htmlFor={checkboxId}
                                  className={cn(
                                    "cursor-pointer border border-(--border) bg-(--panel-muted) px-3 py-3 transition-colors hover:border-(--border-strong) hover:bg-(--panel)",
                                    enabled ? "border-(--border-strong)" : ""
                                  )}
                                >
                                  <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-start gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                      <Checkbox
                                        id={checkboxId}
                                        checked={enabled}
                                        onCheckedChange={() =>
                                          toggleAllowedRequestPath(path)
                                        }
                                        className="mt-0.5 shrink-0"
                                      />
                                      <div className="grid gap-1 pt-0.5">
                                        <p className="text-sm font-medium text-(--text)">
                                          {t(
                                            `settings.sections.channelSetup.requestPathModifierOptions.${path}`
                                          )}
                                        </p>
                                        {path === "guitar" ? (
                                          <p className="text-xs leading-5 text-(--muted)">
                                            {t(
                                              "settings.sections.channelSetup.requestPathModifierGuitarTip"
                                            )}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex w-[8.5rem] items-center justify-end gap-2 pt-0.5">
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                        {t(
                                          "settings.sections.channelSetup.pathModifierVipTokenRequired"
                                        )}
                                      </span>
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        disabled={!enabled}
                                        className="h-8 w-12 px-2 py-1 text-center text-sm"
                                        value={
                                          form.requestPathModifierVipTokenCosts[
                                            path
                                          ]
                                        }
                                        onChange={(event) =>
                                          setRequestPathModifierVipTokenCost(
                                            path,
                                            Number(event.target.value)
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                    </SettingsSubsection>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="filters"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
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
                      title={t("settings.sections.filters.requiredPaths.title")}
                      description={t(
                        "settings.sections.filters.requiredPaths.description"
                      )}
                      open={requiredPathsOpen}
                      onOpenChange={setRequiredPathsOpen}
                      triggerSummary={pathSummary.triggerSummary}
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
                            {t(
                              "settings.sections.filters.requiredPaths.matchAny"
                            )}
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
                            {t(
                              "settings.sections.filters.requiredPaths.matchAll"
                            )}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pathOptions.map((option) => {
                            const isSelected =
                              form.requiredPaths.includes(option);

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
                          {pathSummary.matchExample ||
                          pathSummary.nonMatchExample ? (
                            <div className="grid gap-1 text-sm leading-6 text-(--muted)">
                              {pathSummary.matchExample ? (
                                <p>{pathSummary.matchExample}</p>
                              ) : null}
                              {pathSummary.nonMatchExample ? (
                                <p>{pathSummary.nonMatchExample}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </FilterSection>

                    <FilterSection
                      title={t(
                        "settings.sections.filters.allowedTunings.title"
                      )}
                      description={t(
                        "settings.sections.filters.allowedTunings.description"
                      )}
                      open={allowedTuningsOpen}
                      onOpenChange={setAllowedTuningsOpen}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 grid gap-4">
                          {groupTuningOptions(t, availableTuningOptions).map(
                            (group) => (
                              <div key={group.label} className="grid gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                  {group.label}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {group.options.map((option) => {
                                    const isSelected =
                                      form.allowedTunings.includes(option.id);

                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() =>
                                          toggleAllowedTuning(option.id)
                                        }
                                        aria-pressed={isSelected}
                                        className={`border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                          isSelected
                                            ? "border-(--brand) bg-(--brand) text-white"
                                            : "border-(--border) bg-(--panel-muted) text-(--muted)"
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              allowedTunings: availableTuningOptions.map(
                                (option) => option.id
                              ),
                            }))
                          }
                        >
                          {t(
                            "settings.sections.filters.allowedTunings.allowAll"
                          )}
                        </Button>
                      </div>
                    </FilterSection>

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
                              {t(
                                "settings.sections.filters.officialDlc.import"
                              )}
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
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="limits"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
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
                      <h3 className="text-base font-semibold text-(--text)">
                        {t("settings.sections.queueLimits.queueLimits")}
                      </h3>
                      <div className="divide-y divide-(--border)">
                        <CompactNumberRow
                          label={t("settings.sections.queueLimits.maxPlaylist")}
                          value={form.maxQueueSize}
                          onChange={(value) => setNumber("maxQueueSize", value)}
                        />
                        <CompactNumberRow
                          label={t(
                            "settings.sections.queueLimits.maxPerViewer"
                          )}
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
                          label={t(
                            "settings.sections.queueLimits.maxVipPerViewer"
                          )}
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
                      <h3 className="text-base font-semibold text-(--text)">
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
                          label={t(
                            "settings.sections.queueLimits.enableRegular"
                          )}
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
                              label={t(
                                "settings.sections.queueLimits.vipAllowed"
                              )}
                              value={form.vipRequestsPerPeriod}
                              onChange={(value) =>
                                setNumber("vipRequestsPerPeriod", value)
                              }
                            />
                            <CompactNumberRow
                              label={t(
                                "settings.sections.queueLimits.vipPeriod"
                              )}
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
              </TabsContent>

              <TabsContent
                value="rewards"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
                <Card className="dashboard-settings__section">
                  <CardHeader>
                    <CardTitle as="h2">
                      {t("settings.sections.vipAutomation.title")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.sections.vipAutomation.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6">
                    <div className="grid items-start gap-4 xl:grid-cols-2">
                      <div className="grid min-w-0 gap-4">
                        <div className="grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4">
                          <div className="grid gap-1">
                            <h3 className="text-base font-semibold text-(--text)">
                              {t("settings.sections.vipAutomation.vipCooldown")}
                            </h3>
                            <p className="text-sm leading-6 text-(--muted)">
                              {t(
                                "settings.sections.vipAutomation.vipCooldownHelp"
                              )}
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
                                        Math.trunc(
                                          Number(event.target.value) || 0
                                        )
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
                          <h3 className="text-base font-semibold text-(--text)">
                            {t("settings.sections.vipAutomation.subscribes")}
                          </h3>
                          <PermissionRow
                            label={t("settings.sections.vipAutomation.newSub")}
                            checked={form.autoGrantVipTokenToSubscribers}
                            onChange={(value) =>
                              setBoolean(
                                "autoGrantVipTokenToSubscribers",
                                value
                              )
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
                          <h3 className="text-base font-semibold text-(--text)">
                            {t("settings.sections.vipAutomation.giftedSubs")}
                          </h3>
                          <PermissionRow
                            label={t(
                              "settings.sections.vipAutomation.subGifter"
                            )}
                            checked={form.autoGrantVipTokensToSubGifters}
                            onChange={(value) =>
                              setBoolean(
                                "autoGrantVipTokensToSubGifters",
                                value
                              )
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
                          <h3 className="text-base font-semibold text-(--text)">
                            {t("settings.sections.vipAutomation.raids")}
                          </h3>
                          <PermissionRow
                            label={t(
                              "settings.sections.vipAutomation.raidReward"
                            )}
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
                                        Math.max(
                                          1,
                                          Number(event.target.value) || 0
                                        )
                                      )
                                    }
                                  />
                                </div>
                              </FieldBlock>
                              <div className="border border-dashed border-(--border) bg-(--panel-muted) p-3 text-sm leading-6 text-(--muted)">
                                {t(
                                  "settings.sections.vipAutomation.raidNotice"
                                )}
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
                          <h3 className="text-base font-semibold text-(--text)">
                            {t("settings.sections.vipAutomation.channelPoints")}
                          </h3>
                          <PermissionRow
                            label={t(
                              "settings.sections.vipAutomation.channelPointsToggle"
                            )}
                            checked={
                              form.autoGrantVipTokensForChannelPointRewards
                            }
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
                                    rewardTitle={
                                      vipTokenChannelPointRewardTitle
                                    }
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
                          <h3 className="text-base font-semibold text-(--text)">
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
                                          form.cheerMinimumTokenPercent ===
                                          percent
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
                                  {t(
                                    "settings.sections.vipAutomation.liveExample"
                                  )}
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
                                          percent:
                                            form.cheerMinimumTokenPercent,
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
                          <h3 className="text-base font-semibold text-(--text)">
                            {t("settings.sections.vipAutomation.tips")}
                          </h3>
                          <PermissionRow
                            label={t(
                              "settings.sections.vipAutomation.tipsToggle"
                            )}
                            checked={
                              form.autoGrantVipTokensForStreamElementsTips
                            }
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
                                      {t(
                                        "settings.sections.vipAutomation.setup"
                                      )}
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
                                  {t(
                                    "settings.sections.vipAutomation.setupNote"
                                  )}
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="moderation"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
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
                  <CardContent className="grid max-w-2xl gap-3">
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
                      label={t(
                        "settings.sections.moderatorPermissions.manageTags"
                      )}
                      checked={form.moderatorCanManageTags}
                      onChange={(value) =>
                        setBoolean("moderatorCanManageTags", value)
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
                      {t("settings.sections.rules.title")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.sections.rules.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid max-w-2xl gap-3">
                    <PermissionRow
                      label={t("settings.sections.rules.enableBlacklist")}
                      checked={form.blacklistEnabled}
                      onChange={(value) =>
                        setBoolean("blacklistEnabled", value)
                      }
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
                      {t("settings.sections.channelInstructions.aboutSection")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid max-w-3xl gap-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant={
                          channelInstructionsCopied ? "default" : "outline"
                        }
                        size="sm"
                        onClick={copyChannelInstructions}
                        className="shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                        {channelInstructionsCopied
                          ? t("settings.actions.copied")
                          : t("settings.sections.channelInstructions.copy")}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap border border-(--border) bg-(--panel) p-4 text-sm leading-6 text-(--text)">
                      {channelInstructions}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="overlay"
                forceMount
                className="mt-0 flex-none outline-none data-[state=inactive]:hidden"
              >
                <OverlaySettingsPanel
                  hideSaveButton
                  saveSignal={overlaySaveSignal}
                  onStateChange={handleOverlayStateChange}
                  onSaveSuccess={handleOverlaySaveSuccess}
                  onSaveError={handleOverlaySaveError}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
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
              <h3 className="text-lg font-semibold text-(--text)">
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

function SettingsSubsection(props: {
  title: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 gap-3 border border-(--border) bg-(--panel-soft) p-4",
        props.className
      )}
    >
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-(--text)">{props.title}</h3>
        {props.description ? (
          <p className="text-sm leading-6 text-(--muted)">
            {props.description}
          </p>
        ) : null}
      </div>
      <div className={cn("grid min-w-0 gap-3", props.contentClassName)}>
        {props.children}
      </div>
    </section>
  );
}

function FieldBlock(props: {
  label: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2.5", props.className)}>
      <p className="text-sm font-semibold text-(--text)">{props.label}</p>
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
  triggerSummary?: ReactNode;
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
            <h3 className="text-xl font-semibold leading-tight text-(--text)">
              {props.title}
            </h3>
            <p className="text-sm leading-6 text-(--muted)">
              {props.description}
            </p>
            {props.triggerSummary ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-5 text-(--muted)">
                {props.triggerSummary}
              </div>
            ) : null}
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
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const checkboxId = useId();
  const labelId = useId();
  const descriptionId = useId();

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        "rounded-[10px] border border-(--border) bg-(--panel-soft) px-4 py-3 transition-colors",
        props.disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:border-(--border-strong) hover:bg-(--panel)",
        props.className
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={props.checked}
          onCheckedChange={(checked) => props.onChange(checked === true)}
          disabled={props.disabled}
          className="mt-0.5 shrink-0"
          aria-labelledby={labelId}
          aria-describedby={props.description ? descriptionId : undefined}
        />
        <div className="grid gap-1 pt-0.5 text-sm font-medium text-(--text)">
          <span id={labelId}>{props.label}</span>
          {props.description ? (
            <span
              id={descriptionId}
              className="text-xs leading-5 font-normal text-(--muted)"
            >
              {props.description}
            </span>
          ) : null}
        </div>
      </div>
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
      className={cn(
        "grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-center",
        props.disabled ? "opacity-60" : ""
      )}
    >
      <span className="min-w-0 text-sm font-medium text-(--text)">
        {props.label}
      </span>
      <div className="w-full sm:w-28">
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
              <h3 className="text-lg font-semibold text-(--text)">
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
  settings: Partial<DashboardSettingsFormData>
): DashboardSettingsFormData {
  const hasAllowedRequestPathsSetting = Array.isArray(
    settings.allowedRequestPaths
  );
  const allowedTunings = Array.isArray(settings.allowedTunings)
    ? settings.allowedTunings
    : [];
  const requiredPaths = Array.isArray(settings.requiredPaths)
    ? settings.requiredPaths
    : [];
  const allowedRequestPaths = normalizeAllowedRequestPaths(
    Array.isArray(settings.allowedRequestPaths)
      ? settings.allowedRequestPaths
      : []
  );
  const requestPathModifierVipTokenCosts =
    getRequestPathModifierVipTokenCostsSetting(settings);
  const vipTokenDurationThresholds = Array.isArray(
    settings.vipTokenDurationThresholds
  )
    ? settings.vipTokenDurationThresholds
    : [];
  const allowRequestPathModifiers =
    settings.allowRequestPathModifiers ?? allowedRequestPaths.length > 0;
  const normalizedAllowedRequestPaths =
    allowedRequestPaths.length > 0
      ? allowedRequestPaths
      : !hasAllowedRequestPathsSetting && allowRequestPathModifiers
        ? [...legacyRequestPathModifierOptions]
        : [];

  return {
    ...defaultForm,
    ...settings,
    allowedTunings: allowedTunings.length ? allowedTunings : allKnownTuningIds,
    requiredPaths,
    allowedRequestPaths: normalizedAllowedRequestPaths,
    vipRequestCooldownEnabled: settings.vipRequestCooldownEnabled ?? false,
    vipRequestCooldownMinutes: settings.vipRequestCooldownMinutes ?? 0,
    showPickOrderBadges: settings.showPickOrderBadges ?? false,
    allowRequestPathModifiers,
    requestPathModifierVipTokenCost: getLegacyRequestPathModifierVipTokenCost({
      allowedRequestPaths: normalizedAllowedRequestPaths,
      requestPathModifierVipTokenCosts,
    }),
    requestPathModifierVipTokenCosts,
    requestPathModifierUsesVipPriority: false,
    vipTokenDurationThresholds: normalizeVipTokenDurationThresholds(
      vipTokenDurationThresholds
    ),
    moderatorCanViewVipTokens: true,
  };
}

function getLegacyRequestPathModifierVipTokenCost(input: {
  allowedRequestPaths: string[];
  requestPathModifierVipTokenCosts: DashboardSettingsFormData["requestPathModifierVipTokenCosts"];
}) {
  return normalizeAllowedRequestPaths(input.allowedRequestPaths).reduce(
    (highestCost, path) =>
      Math.max(highestCost, input.requestPathModifierVipTokenCosts[path] ?? 0),
    0
  );
}

function getSettingsComparisonSnapshot(settings: DashboardSettingsFormData) {
  const normalized = normalizeSettingsFormData(settings);
  const comparable = Object.fromEntries(
    settingsComparisonKeys.map((key) => [key, normalized[key]])
  ) as DashboardSettingsFormData;

  return JSON.stringify({
    ...comparable,
    allowedTunings: [...comparable.allowedTunings].sort(
      (left, right) => left - right
    ),
    allowedRequestPaths: [...comparable.allowedRequestPaths].sort(),
    requiredPaths: [...comparable.requiredPaths].sort(),
  });
}

function formatPathOptionLabel(_t: (key: string) => string, value: string) {
  return value;
}

function getPathBadgeTone(value: string) {
  switch (value.toLowerCase()) {
    case "lead":
      return "border-emerald-700/50 bg-emerald-950 text-emerald-100";
    case "rhythm":
      return "border-sky-700/50 bg-sky-950 text-sky-100";
    case "bass":
      return "border-orange-700/50 bg-orange-950 text-orange-100";
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
      matchExample: null,
      nonMatchExample: null,
      triggerSummary: null,
    };
  }

  const triggerSummary = (
    <>
      <span className="font-semibold uppercase tracking-[0.16em] text-(--muted)">
        {matchMode === "all"
          ? t("settings.sections.filters.requiredPaths.triggerAll")
          : t("settings.sections.filters.requiredPaths.triggerAny")}
      </span>
      {renderPathTriggerBadges(t, requiredPaths)}
    </>
  );

  if (requiredPaths.length === 1) {
    return {
      summary: (
        <>
          {t("settings.sections.filters.requiredPaths.singlePrefix")}{" "}
          {renderPathLabel(t, requiredPaths[0])}.{" "}
          {t("settings.sections.filters.requiredPaths.singleSuffix")}
        </>
      ),
      matchExample: (
        <>
          {t("settings.sections.filters.requiredPaths.exampleLabel")}{" "}
          {renderPathExampleSequence(
            t,
            extraPath ? [requiredPaths[0], extraPath] : [requiredPaths[0]]
          )}{" "}
          {t("settings.sections.filters.requiredPaths.singleExample")}
        </>
      ),
      nonMatchExample: extraPath ? (
        <>
          {t("settings.sections.filters.requiredPaths.nonMatchExampleLabel")}{" "}
          {renderPathExampleSequence(t, [extraPath])}{" "}
          {t("settings.sections.filters.requiredPaths.singleNonMatchExample")}
        </>
      ) : null,
      triggerSummary,
    };
  }

  if (matchMode === "any") {
    const selectedPath = requiredPaths[1] ?? requiredPaths[0];
    const allPathsSelected = requiredPaths.length === pathOptions.length;
    return {
      summary: (
        <>
          {t("settings.sections.filters.requiredPaths.matchAnyPrefix")}{" "}
          {renderPathSummaryList(t, requiredPaths)}.{" "}
          {t(
            allPathsSelected
              ? "settings.sections.filters.requiredPaths.matchAnyAllSelectedSuffix"
              : "settings.sections.filters.requiredPaths.matchAnySuffix"
          )}
        </>
      ),
      matchExample: (
        <>
          {t("settings.sections.filters.requiredPaths.exampleLabel")}{" "}
          {renderPathExampleSequence(
            t,
            extraPath ? [selectedPath, extraPath] : [selectedPath]
          )}{" "}
          {t("settings.sections.filters.requiredPaths.matchAnyExample")}
        </>
      ),
      nonMatchExample: extraPath ? (
        <>
          {t("settings.sections.filters.requiredPaths.nonMatchExampleLabel")}{" "}
          {renderPathExampleSequence(t, [extraPath])}{" "}
          {t("settings.sections.filters.requiredPaths.matchAnyNonMatchExample")}
        </>
      ) : null,
      triggerSummary,
    };
  }

  const missingPathExample = requiredPaths.slice(0, -1);
  const nonMatchSequence =
    extraPath && missingPathExample.length > 0
      ? [...missingPathExample, extraPath]
      : missingPathExample;

  return {
    summary: (
      <>
        {t("settings.sections.filters.requiredPaths.matchAllPrefix")}{" "}
        {renderPathSummaryList(t, requiredPaths)}.{" "}
        {t("settings.sections.filters.requiredPaths.matchAllSuffix")}
      </>
    ),
    matchExample: (
      <>
        {t("settings.sections.filters.requiredPaths.exampleLabel")}{" "}
        {renderPathExampleSequence(
          t,
          extraPath ? [...requiredPaths, extraPath] : requiredPaths
        )}{" "}
        {t("settings.sections.filters.requiredPaths.matchAllExample")}
      </>
    ),
    nonMatchExample:
      nonMatchSequence.length > 0 ? (
        <>
          {t("settings.sections.filters.requiredPaths.nonMatchExampleLabel")}{" "}
          {renderPathExampleSequence(t, nonMatchSequence)}{" "}
          {t("settings.sections.filters.requiredPaths.matchAllNonMatchExample")}
        </>
      ) : null,
    triggerSummary,
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

function renderPathTriggerBadges(t: (key: string) => string, values: string[]) {
  return values.map((value, index) => (
    <span
      key={`trigger-${value}-${index}`}
      className={`inline-flex items-center border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getPathBadgeTone(
        value
      )}`}
    >
      {formatPathOptionLabel(t, value)}
    </span>
  ));
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
  options: readonly TuningOption[]
) {
  const groups = new Map<string, TuningOption[]>();

  for (const option of options) {
    const group = getTuningGroupLabel(t, option.label);
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
