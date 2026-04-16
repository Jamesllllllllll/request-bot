import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  CircleHelp,
  Disc3,
  GripVertical,
  Heart,
  LoaderCircle,
  MoreHorizontal,
  PencilLine,
  Play,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sword,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PickOrderBadge } from "~/components/pick-order-badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { pathOptions } from "~/lib/channel-options";
import {
  AppI18nProvider,
  useAppLocale,
  useLocaleTranslation,
} from "~/lib/i18n/client";
import { type AppLocale, localeOptions } from "~/lib/i18n/locales";
import {
  getQueuedPositionsFromRegularOrder,
  getUpdatedPositionsAfterSetCurrent,
  getUpdatedQueuedPositionsAfterKindChange,
} from "~/lib/playlist/order";
import type { PlaylistStreamNotifyReason } from "~/lib/playlist/realtime";
import { areChannelRequestsOpen } from "~/lib/request-availability";
import { formatPathLabel } from "~/lib/request-policy";
import {
  getAvailableRequestedPaths,
  getPrimaryRequestedPath,
  getRequestVipTokenPlan,
  type RequestPathOption,
} from "~/lib/requested-paths";
import {
  normalizeSearchFilterOptionsResponse,
  type SearchFilterOptionsResponse,
  type SearchFilterOptionsWireResponse,
} from "~/lib/song-search/filter-options";
import type { TuningOption } from "~/lib/tunings";
import { cn } from "~/lib/utils";
import { getVipTokenAutomationDetails } from "~/lib/vip-token-automation";
import {
  formatVipDurationThresholdMinutes,
  formatVipTokenCostLabel,
  parseVipTokenDurationThresholds,
  type VipTokenDurationThreshold,
} from "~/lib/vip-token-duration-thresholds";
import { formatVipTokenCount } from "~/lib/vip-tokens";
import { emitExtensionPanelClientTrace } from "./client-trace";
import { toExtensionApiUrl, toExtensionAppUrl } from "./config";
import {
  applyDemoViewerRequestMutation,
  createMockModeratorPlaylistItems,
  getDemoViewerActiveRequests,
  mockModeratorViewerProfile,
  type PanelDemoPlaylist,
} from "./demo";
import {
  persistPanelStoredLocale,
  readPanelStoredLocale,
  resolveExtensionPanelLocale,
} from "./locale";
import { parseExtensionPanelPubSubMessage } from "./pubsub";
import {
  appendPanelSearchFiltersToParams,
  arePanelSearchFiltersEqual,
  canonicalizePanelSearchFilters,
  canRunPanelSearch,
  createPanelSearchFilters,
  type PanelSearchFilters,
  type PanelSearchPath,
} from "./search-filters";
import {
  getTwitchExtensionHelper,
  loadTwitchExtensionHelper,
  type TwitchExtensionAuth,
} from "./twitch-ext";

type PanelBootstrapResponse = {
  connected: boolean;
  channel: null | {
    id: string;
    slug: string;
    login: string;
    displayName: string;
    twitchChannelId: string;
    isLive: boolean;
    botReadyState?: string | null;
  };
  settings: {
    defaultLocale: string;
    requestsEnabled: boolean;
    defaultSearchPaths: string[];
    defaultSearchPathsMatchMode: "any" | "all";
    allowRequestPathModifiers: boolean;
    allowedRequestPaths: string[];
    requestPathModifierVipTokenCost: number;
    requestPathModifierVipTokenCosts: {
      guitar: number;
      lead: number;
      rhythm: number;
      bass: number;
    };
    requestPathModifierUsesVipPriority: boolean;
    vipTokenDurationThresholdsJson: string;
    showPlaylistPositions: boolean;
    showPickOrderBadges: boolean;
    autoGrantVipTokenToSubscribers: boolean;
    autoGrantVipTokensForSharedSubRenewalMessage: boolean;
    autoGrantVipTokensToSubGifters: boolean;
    autoGrantVipTokensToGiftRecipients: boolean;
    autoGrantVipTokensForCheers: boolean;
    cheerBitsPerVipToken: number;
    cheerMinimumTokenPercent: number;
    autoGrantVipTokensForRaiders: boolean;
    raidMinimumViewerCount: number;
    autoGrantVipTokensForStreamElementsTips: boolean;
    streamElementsTipAmountPerVipToken: number;
  };
  playlist: {
    currentItemId: string | null;
    items: Array<Record<string, unknown>>;
  };
  viewer: {
    isLinked: boolean;
    opaqueUserId?: string | null;
    profile: null | {
      twitchUserId: string;
      login: string;
      displayName: string;
      profileImageUrl?: string | null;
      preferredLocale?: string | null;
      isSubscriber: boolean;
      subscriptionVerified: boolean;
      vipTokensAvailable: number;
      activeRequestLimit: number | null;
    };
    activeRequests: Array<Record<string, unknown>>;
    canRequest: boolean;
    canVipRequest: boolean;
    canEditOwnRequest: boolean;
    canRemoveOwnRequest: boolean;
    access: {
      allowed: boolean;
      reason?: string;
    };
  };
  management: {
    accessRole: "owner" | "moderator" | "viewer";
    actorUserId?: string | null;
    permissions: {
      canManageRequests: boolean;
      canManageBlacklist: boolean;
      canManageSetlist: boolean;
      canManageBlockedChatters: boolean;
      canViewVipTokens: boolean;
      canManageVipTokens: boolean;
      canManageTags: boolean;
    };
  };
  setup: null | {
    code: string;
    message: string;
  };
};

type PanelPlaylistItem = Record<string, unknown>;

type PanelSearchResponse = {
  items: Array<Record<string, unknown>>;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

type PanelStateResponse = {
  channel: {
    isLive: boolean;
    botReadyState?: string | null;
  };
  settings: PanelBootstrapResponse["settings"];
  playlist: PanelBootstrapResponse["playlist"];
  viewer: Pick<
    PanelBootstrapResponse["viewer"],
    | "profile"
    | "activeRequests"
    | "canVipRequest"
    | "canEditOwnRequest"
    | "canRemoveOwnRequest"
  >;
};

type PreviewCatalogSearchResponse = {
  results: Array<Record<string, unknown>>;
  total?: number;
  page?: number;
  pageSize?: number;
  hiddenBlacklistedCount?: number;
  error?: string;
};

type PanelPlaylistMutation =
  | { action: "setCurrent"; itemId: string }
  | { action: "returnToQueue"; itemId: string }
  | { action: "markPlayed"; itemId: string }
  | { action: "deleteItem"; itemId: string }
  | {
      action: "manualAdd";
      songId: string;
      requesterLogin?: string;
      requesterTwitchUserId?: string;
      requesterDisplayName?: string;
      title: string;
      authorId?: number;
      groupedProjectId?: number;
      artist?: string;
      album?: string;
      creator?: string;
      tuning?: string;
      parts?: string[];
      durationText?: string;
      source: string;
      sourceUrl?: string;
      sourceId?: number;
      candidateMatchesJson?: string;
    }
  | {
      action: "changeRequestKind";
      itemId: string;
      requestKind: "regular" | "vip";
    }
  | { action: "shufflePlaylist" }
  | {
      action: "reorderItems";
      orderedItemIds: string[];
    };

type PanelPlaylistMutationResponse = {
  error?: string;
  message?: string;
  ok?: boolean;
};

type PanelViewerRequestSubmitInput =
  | {
      songId: string;
      requestKind: "regular" | "vip";
      requestMode?: "catalog";
      requestedPath?: RequestPathOption;
      vipTokenCost?: number;
    }
  | {
      query: string;
      requestKind: "regular" | "vip";
      requestMode: "random" | "choice";
      vipTokenCost?: number;
    }
  | {
      requestKind: "regular" | "vip";
      requestMode: "favorite";
      vipTokenCost?: number;
    };

type PanelDropTargetState = {
  itemId: string;
  edge: Edge;
} | null;

type TransientPanelNotice = {
  id: number;
  message: string;
  tone: "danger" | "success";
};

const PANEL_VISIBLE_REFRESH_INTERVAL_MS = 15_000;
type PanelRefreshCause =
  | "initial-load"
  | "poll"
  | "visibility"
  | "pubsub:playlist"
  | "pubsub:requests"
  | "pubsub:settings"
  | "pubsub:stream-status"
  | "pubsub:blacklist"
  | "pubsub:setlist"
  | "pubsub:blocks"
  | "pubsub:vip-tokens"
  | "pubsub:favorites"
  | "pubsub:chat-activity"
  | "viewer-request-success"
  | "viewer-request-failure"
  | "remove-request-success"
  | "remove-request-failure"
  | "playlist-mutation-success"
  | "playlist-mutation-failure"
  | "state-requests-open-changed";

export function ExtensionPanelApp(props: { apiBaseUrl?: string }) {
  const [initialLocale, setInitialLocale] = useState<AppLocale>(() =>
    resolveExtensionPanelLocale({
      search: typeof window !== "undefined" ? window.location.search : null,
      storedLocale: readPanelStoredLocale(),
      documentLanguage:
        typeof document !== "undefined" ? document.documentElement.lang : null,
      navigatorLanguage:
        typeof navigator !== "undefined" ? navigator.language : null,
    })
  );

  return (
    <AppI18nProvider initialLocale={initialLocale}>
      <ExtensionPanelAppContent
        {...props}
        onResolvedLocaleChange={setInitialLocale}
      />
    </AppI18nProvider>
  );
}

function ExtensionPanelAppContent(props: {
  apiBaseUrl?: string;
  onResolvedLocaleChange?: (locale: AppLocale) => void;
}) {
  const { t } = useLocaleTranslation("extension");
  const { locale, setLocale, isSavingLocale } = useAppLocale();
  const [helperState, setHelperState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperTimedOut, setHelperTimedOut] = useState(false);
  const [auth, setAuth] = useState<TwitchExtensionAuth | null>(null);
  const [bootstrap, setBootstrap] = useState<PanelBootstrapResponse | null>(
    null
  );
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(
    null
  );
  const [pendingPubSubReason, setPendingPubSubReason] =
    useState<PlaylistStreamNotifyReason | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickRandomQuery, setQuickRandomQuery] = useState("");
  const [quickChoiceQuery, setQuickChoiceQuery] = useState("");
  const [searchFiltersOverride, setSearchFiltersOverride] =
    useState<PanelSearchFilters | null>(null);
  const [searchResults, setSearchResults] =
    useState<PanelSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [lastSubmittedSearchQuery, setLastSubmittedSearchQuery] = useState<
    string | null
  >(null);
  const [lastSubmittedSearchFilters, setLastSubmittedSearchFilters] =
    useState<PanelSearchFilters | null>(null);
  const [activeTab, setActiveTab] = useState<"playlist" | "search">("playlist");
  const [transientNotice, setTransientNotice] =
    useState<TransientPanelNotice | null>(null);
  const [vipHelpOpen, setVipHelpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmingRemoveItemId, setConfirmingRemoveItemId] = useState<
    string | null
  >(null);
  const [expandedActionItemId, setExpandedActionItemId] = useState<
    string | null
  >(null);
  const [editingRequestItemId, setEditingRequestItemId] = useState<
    string | null
  >(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetState, setDropTargetState] =
    useState<PanelDropTargetState>(null);
  const authCallbackRegisteredRef = useRef(false);
  const bootstrapReadyTraceKeyRef = useRef<string | null>(null);
  const latestSearchRequestRef = useRef(0);
  const latestTransientNoticeIdRef = useRef(0);
  const removeConfirmRef = useRef<HTMLDivElement | null>(null);

  const activeRequestCount = bootstrap?.viewer.activeRequests.length ?? 0;
  const activeRequestLimit =
    bootstrap?.viewer.profile?.activeRequestLimit ?? null;
  const queueCount = bootstrap?.playlist.items.length ?? 0;
  const showPlaylistPositions =
    bootstrap?.settings.showPlaylistPositions ?? false;
  const showPickOrderBadges = bootstrap?.settings.showPickOrderBadges ?? false;
  const vipTokenAutomationDetails = getVipTokenAutomationDetails(
    bootstrap?.settings ?? {},
    {
      locale,
      translate: (key, options) => t(key, options),
    }
  );
  const vipTokenDurationThresholds = useMemo(
    () =>
      parseVipTokenDurationThresholds(
        bootstrap?.settings.vipTokenDurationThresholdsJson
      ),
    [bootstrap?.settings.vipTokenDurationThresholdsJson]
  );
  const addRequestsWhenLiveMessage = t("requests.addWhenLive");
  const managementPermissions = bootstrap?.management.permissions;
  const canManagePlaylist = managementPermissions?.canManageRequests ?? false;
  const canManageVipRequests =
    !!managementPermissions?.canManageRequests &&
    !!managementPermissions?.canManageVipTokens;
  const requestsEnabled = bootstrap?.settings.requestsEnabled ?? true;
  const channelRequestsOpen = areChannelRequestsOpen(bootstrap?.channel ?? {});
  const viewerRequestsAvailable = channelRequestsOpen && requestsEnabled;
  const viewerProfile = bootstrap?.viewer.profile ?? null;
  const canQuickRequest = canManagePlaylist
    ? !!bootstrap?.viewer.canRequest
    : viewerRequestsAvailable && !!bootstrap?.viewer.canRequest;
  const canQuickVipRequest = canManagePlaylist
    ? !!bootstrap?.viewer.canVipRequest
    : viewerRequestsAvailable && !!bootstrap?.viewer.canVipRequest;
  const quickVipDisabledReason = canManagePlaylist
    ? !channelRequestsOpen
      ? addRequestsWhenLiveMessage
      : viewerProfile && viewerProfile.vipTokensAvailable < 1
        ? t("vip.notEnough")
        : null
    : !viewerRequestsAvailable
      ? addRequestsWhenLiveMessage
      : viewerProfile && viewerProfile.vipTokensAvailable < 1
        ? t("vip.notEnough")
        : null;
  const showViewerSearchActions =
    !canManagePlaylist && (canQuickRequest || canQuickVipRequest);
  const showSpecialRequestControls = canQuickRequest || canQuickVipRequest;
  const showManagerSearchActions = canManagePlaylist;
  const searchTabBlockedByRequestsOff = !canManagePlaylist && !requestsEnabled;
  const playlistItems = bootstrap?.playlist.items ?? [];
  const currentPlaylistItemId = bootstrap?.playlist.currentItemId ?? null;
  const queuedPlaylistItems = playlistItems.filter(
    (item) => getString(item, "id") !== currentPlaylistItemId
  );
  const showShufflePlaylistControl =
    canManagePlaylist && queuedPlaylistItems.length > 1;
  const canShufflePlaylist =
    showShufflePlaylistControl && currentPlaylistItemId == null;
  const shufflePlaylistTooltip = currentPlaylistItemId
    ? t("queue.shuffleBlocked")
    : t("queue.shuffle");
  const canReorderPlaylist =
    canManagePlaylist && queuedPlaylistItems.length > 1;
  const waitingForAuthorization =
    helperState === "loading" ||
    (helperState === "ready" && !auth && !helperTimedOut);
  const waitingForBootstrap = !!auth?.token && !bootstrap && !bootstrapError;
  const showLoadingSkeleton =
    waitingForAuthorization ||
    waitingForBootstrap ||
    (!!auth?.token && !bootstrap && !bootstrapError);
  const editingRequest = getViewerEditablePanelItem(
    playlistItems,
    viewerProfile,
    editingRequestItemId
  );
  const isEditingRequest = editingRequest != null;
  const defaultSearchFilters = useMemo(
    () =>
      createPanelSearchFilters({
        parts: bootstrap?.settings.defaultSearchPaths,
        partsMatchMode: bootstrap?.settings.defaultSearchPathsMatchMode,
      }),
    [
      bootstrap?.settings.defaultSearchPaths,
      bootstrap?.settings.defaultSearchPathsMatchMode,
    ]
  );
  const searchFilters = searchFiltersOverride ?? defaultSearchFilters;
  const searchFiltersChangedFromDefaults = searchFiltersOverride != null;
  const showingSubmittedSearchState =
    lastSubmittedSearchQuery != null &&
    lastSubmittedSearchFilters != null &&
    lastSubmittedSearchQuery === searchQuery.trim() &&
    arePanelSearchFiltersEqual(lastSubmittedSearchFilters, searchFilters);

  useEffect(() => {
    document.documentElement.classList.add("extension-mode");
    document.body.classList.add("extension-mode");

    return () => {
      document.documentElement.classList.remove("extension-mode");
      document.body.classList.remove("extension-mode");
    };
  }, []);

  useEffect(() => {
    if (!searchTabBlockedByRequestsOff) {
      return;
    }

    setSearchResults(null);
    setSearchError(null);
    setSearching(false);
    setLastSubmittedSearchQuery(null);
    setLastSubmittedSearchFilters(null);
  }, [searchTabBlockedByRequestsOff]);

  useEffect(() => {
    if (!transientNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransientNotice((current) =>
        current?.id === transientNotice.id ? null : current
      );
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [transientNotice]);

  useEffect(() => {
    if (!confirmingRemoveItemId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        removeConfirmRef.current &&
        !removeConfirmRef.current.contains(target)
      ) {
        setConfirmingRemoveItemId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [confirmingRemoveItemId]);

  useEffect(() => {
    if (editingRequestItemId && !editingRequest) {
      setEditingRequestItemId(null);
    }
  }, [editingRequest, editingRequestItemId]);

  useEffect(() => {
    setSearchFiltersOverride(null);
    setQuickRandomQuery("");
    setQuickChoiceQuery("");
  }, [bootstrap?.channel?.slug]);

  useEffect(() => {
    if (getString(editingRequest ?? {}, "warningCode") !== "streamer_choice") {
      return;
    }

    setQuickChoiceQuery(
      getString(editingRequest ?? {}, "requestedQuery") ?? ""
    );
  }, [editingRequest]);

  useEffect(() => {
    let cancelled = false;

    emitExtensionPanelClientTrace({
      event: "extension_helper_load_started",
      helperState,
    });

    void loadTwitchExtensionHelper()
      .then(() => {
        if (!cancelled) {
          emitExtensionPanelClientTrace({
            event: "extension_helper_load_completed",
            helperState: "ready",
          });
          setHelperState("ready");
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        emitExtensionPanelClientTrace({
          event: "extension_helper_load_failed",
          helperState: "error",
          message:
            error instanceof Error && error.message.trim()
              ? error.message
              : t("notices.helperLoadFailed"),
        });
        setHelperState("error");
        setHelperError(
          error instanceof Error && error.message.trim()
            ? error.message
            : t("notices.helperLoadFailed")
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (helperState !== "ready" || authCallbackRegisteredRef.current) {
      return;
    }

    const helper = getTwitchExtensionHelper();
    if (!helper) {
      emitExtensionPanelClientTrace({
        event: "extension_helper_unavailable",
        helperState: "error",
        message: t("notices.helperUnavailable"),
      });
      setHelperState("error");
      setHelperError(t("notices.helperUnavailable"));
      return;
    }

    authCallbackRegisteredRef.current = true;
    helper.onAuthorized((nextAuth) => {
      emitExtensionPanelClientTrace({
        event: "extension_authorized",
        channelId: nextAuth.channelId,
        isLinked: Boolean(nextAuth.userId),
        helperState: "ready",
      });
      setAuth(nextAuth);
      setHelperTimedOut(false);
      setBootstrapError(null);
      setConnectionMessage(null);
      setTransientNotice(null);
    });
  }, [helperState]);

  useEffect(() => {
    if (helperState !== "ready" || auth) {
      return;
    }

    const timeout = window.setTimeout(() => {
      emitExtensionPanelClientTrace({
        event: "extension_authorization_timeout",
        helperState,
      });
      setHelperTimedOut(true);
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [auth, helperState]);

  useEffect(() => {
    if (!auth?.token) {
      return;
    }

    let cancelled = false;
    let retryTimeout: number | null = null;

    const loadBootstrap = async (attempt = 0) => {
      try {
        const data = await refreshBootstrapState({
          token: auth.token,
          silent: true,
          throwOnError: true,
          cause: "initial-load",
        });

        if (cancelled || !data) {
          return;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isRetriableExtensionError(error)) {
          const retryDelayMs = getRetryDelayMs(attempt, 1500, 30000);
          setConnectionMessage(
            t("notices.connectingRetry", {
              delay: formatRetryDelay(retryDelayMs),
            })
          );
          retryTimeout = window.setTimeout(() => {
            void loadBootstrap(attempt + 1);
          }, retryDelayMs);
          return;
        }

        setBootstrapError(
          getErrorText(error, t("notices.panelStateLoadFailed"))
        );
      }
    };

    void loadBootstrap();

    return () => {
      cancelled = true;
      if (retryTimeout != null) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [auth?.token, props.apiBaseUrl]);

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    const nextTraceKey = [
      bootstrap.connected ? "1" : "0",
      bootstrap.channel?.id ?? "no-channel",
      bootstrap.viewer.isLinked ? "1" : "0",
      bootstrap.viewer.profile?.twitchUserId ?? "no-viewer",
    ].join(":");

    if (bootstrapReadyTraceKeyRef.current === nextTraceKey) {
      return;
    }

    bootstrapReadyTraceKeyRef.current = nextTraceKey;
    emitExtensionPanelClientTrace({
      event: "extension_bootstrap_state_ready",
      channelId: bootstrap.channel?.id ?? null,
      connected: bootstrap.connected,
      isLinked: bootstrap.viewer.isLinked,
    });
  }, [bootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    props.onResolvedLocaleChange?.(
      resolveExtensionPanelLocale({
        search: window.location.search,
        storedLocale: readPanelStoredLocale(),
        documentLanguage: document.documentElement.lang,
        navigatorLanguage: navigator.language,
        viewerPreferredLocale: bootstrap?.viewer.profile?.preferredLocale,
        channelDefaultLocale: bootstrap?.settings.defaultLocale,
      })
    );
  }, [
    bootstrap?.settings.defaultLocale,
    bootstrap?.viewer.profile?.preferredLocale,
    props.onResolvedLocaleChange,
  ]);

  async function setPanelLocale(nextLocale: AppLocale) {
    persistPanelStoredLocale(nextLocale);
    await setLocale(nextLocale);
  }

  async function refreshBootstrapState(input?: {
    token?: string;
    silent?: boolean;
    throwOnError?: boolean;
    cause?: PanelRefreshCause;
  }) {
    const token = input?.token ?? auth?.token;
    if (!token) {
      return null;
    }

    try {
      emitExtensionPanelClientTrace({
        event: "extension_bootstrap_fetch_started",
        channelId: auth?.channelId ?? null,
        detail: input?.cause ?? (input?.silent ? "silent" : "interactive"),
      });
      const data = await fetchExtensionJson<PanelBootstrapResponse>(
        token,
        "/api/extension/bootstrap",
        props.apiBaseUrl,
        {
          headers: {
            "x-extension-refresh-cause":
              input?.cause ?? (input?.silent ? "silent" : "interactive"),
          },
        }
      );

      emitExtensionPanelClientTrace({
        event: "extension_bootstrap_fetch_completed",
        channelId: data.channel?.id ?? auth?.channelId ?? null,
        detail: input?.cause ?? undefined,
        connected: data.connected,
        isLinked: data.viewer.isLinked,
      });

      startTransition(() => {
        setBootstrap(data);
        setBootstrapError(null);
        setConnectionMessage(null);
      });

      return data;
    } catch (error) {
      if (input?.throwOnError) {
        emitExtensionPanelClientTrace({
          event: "extension_bootstrap_fetch_failed",
          channelId: auth?.channelId ?? null,
          detail: input?.cause ?? undefined,
          status: error instanceof ExtensionRequestError ? error.status : null,
          message: getErrorText(error, t("notices.panelStateLoadFailed")),
        });
        throw error;
      }

      emitExtensionPanelClientTrace({
        event: "extension_bootstrap_fetch_failed",
        channelId: auth?.channelId ?? null,
        detail: input?.cause ?? undefined,
        status: error instanceof ExtensionRequestError ? error.status : null,
        message: getErrorText(error, t("notices.panelStateLoadFailed")),
      });
      if (!input?.silent) {
        setBootstrapError(
          getErrorText(error, t("notices.panelStateLoadFailed"))
        );
      }

      return null;
    }
  }

  function showTransientNotice(
    tone: TransientPanelNotice["tone"],
    message: string
  ) {
    latestTransientNoticeIdRef.current += 1;
    setTransientNotice({
      id: latestTransientNoticeIdRef.current,
      tone,
      message,
    });
  }

  async function refreshPanelState(input?: {
    token?: string;
    silent?: boolean;
    cause?: PanelRefreshCause;
  }) {
    const token = input?.token ?? auth?.token;
    if (!token) {
      return null;
    }

    try {
      emitExtensionPanelClientTrace({
        event: "extension_state_refresh_started",
        channelId: auth?.channelId ?? null,
        detail: input?.cause ?? (input?.silent ? "silent" : "interactive"),
      });
      const data = await fetchExtensionJson<PanelStateResponse>(
        token,
        "/api/extension/state",
        props.apiBaseUrl,
        {
          headers: {
            "x-extension-refresh-cause":
              input?.cause ?? (input?.silent ? "silent" : "interactive"),
          },
        }
      );

      if (
        areChannelRequestsOpen(bootstrap?.channel ?? {}) !==
        areChannelRequestsOpen(data.channel)
      ) {
        emitExtensionPanelClientTrace({
          event: "extension_state_refresh_requires_bootstrap",
          channelId: auth?.channelId ?? null,
          detail: input?.cause ?? "state-requests-open-changed",
        });
        await refreshBootstrapState({
          token,
          silent: input?.silent,
          cause: "state-requests-open-changed",
        });

        return data;
      }

      emitExtensionPanelClientTrace({
        event: "extension_state_refresh_completed",
        channelId: auth?.channelId ?? null,
        detail: input?.cause ?? undefined,
        connected: true,
      });

      startTransition(() => {
        setBootstrap((current) =>
          current
            ? {
                ...current,
                channel: current.channel
                  ? {
                      ...current.channel,
                      isLive: data.channel.isLive,
                      botReadyState: data.channel.botReadyState,
                    }
                  : current.channel,
                settings: data.settings,
                playlist: data.playlist,
                viewer: {
                  ...current.viewer,
                  activeRequests: data.viewer.activeRequests,
                  canVipRequest: data.viewer.canVipRequest,
                  canEditOwnRequest: data.viewer.canEditOwnRequest,
                  canRemoveOwnRequest: data.viewer.canRemoveOwnRequest,
                  profile: data.viewer.profile ?? current.viewer.profile,
                },
              }
            : current
        );
        setBootstrapError(null);
        setConnectionMessage(null);
      });

      return data;
    } catch (error) {
      emitExtensionPanelClientTrace({
        event: "extension_state_refresh_failed",
        channelId: auth?.channelId ?? null,
        detail: input?.cause ?? undefined,
        status: error instanceof ExtensionRequestError ? error.status : null,
        message: getErrorText(error, t("notices.panelStateRefreshFailed")),
      });
      if (!input?.silent) {
        setBootstrapError(
          getErrorText(error, t("notices.panelStateRefreshFailed"))
        );
      }
      return null;
    }
  }

  async function handlePanelPubSubRefresh(reason: PlaylistStreamNotifyReason) {
    const refreshedBootstrap = await refreshBootstrapState({
      token: auth?.token,
      silent: true,
      cause: `pubsub:${reason}`,
    });

    if (!refreshedBootstrap) {
      return;
    }
  }

  useEffect(() => {
    if (helperState !== "ready" || !auth?.token) {
      return;
    }

    const helper = getTwitchExtensionHelper();
    if (!helper?.listen || !helper.unlisten) {
      return;
    }

    const handlePubSubMessage = (
      target: string,
      contentType: string,
      message: string
    ) => {
      if (target !== "broadcast") {
        return;
      }

      const parsed = parseExtensionPanelPubSubMessage({
        contentType,
        message,
      });
      if (!parsed) {
        return;
      }

      emitExtensionPanelClientTrace({
        event: "extension_pubsub_received",
        channelId: auth?.channelId ?? null,
        detail: parsed.reason,
      });

      if (draggingItemId) {
        emitExtensionPanelClientTrace({
          event: "extension_pubsub_deferred",
          channelId: auth?.channelId ?? null,
          detail: parsed.reason,
        });
        setPendingPubSubReason(parsed.reason);
        return;
      }

      void handlePanelPubSubRefresh(parsed.reason);
    };

    helper.listen("broadcast", handlePubSubMessage);

    return () => {
      helper.unlisten?.("broadcast", handlePubSubMessage);
    };
  }, [auth?.token, draggingItemId, helperState]);

  useEffect(() => {
    if (!pendingPubSubReason || draggingItemId) {
      return;
    }

    const reason = pendingPubSubReason;
    setPendingPubSubReason(null);
    void handlePanelPubSubRefresh(reason);
  }, [draggingItemId, pendingPubSubReason]);

  useEffect(() => {
    if (!auth?.token || !bootstrap) {
      return;
    }

    let cancelled = false;
    let retryAttempt = 0;
    let timeoutId: number | null = null;

    const scheduleNextRefresh = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        void refreshIfVisible();
      }, delayMs);
    };

    const refreshIfVisible = async () => {
      if (cancelled) {
        return;
      }

      if (document.visibilityState !== "visible" || draggingItemId) {
        scheduleNextRefresh(PANEL_VISIBLE_REFRESH_INTERVAL_MS);
        return;
      }

      const data = await refreshPanelState({
        token: auth.token,
        silent: true,
        cause: "poll",
      });

      if (cancelled) {
        return;
      }

      if (data) {
        retryAttempt = 0;
        setConnectionMessage(null);
        scheduleNextRefresh(PANEL_VISIBLE_REFRESH_INTERVAL_MS);
        return;
      }

      retryAttempt += 1;
      const retryDelayMs = getRetryDelayMs(retryAttempt, 3000, 60000);
      setConnectionMessage(
        t("notices.connectionInterruptedRetry", {
          delay: formatRetryDelay(retryDelayMs),
        })
      );
      scheduleNextRefresh(retryDelayMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }
        void refreshPanelState({
          token: auth.token,
          silent: true,
          cause: "visibility",
        }).then((data) => {
          if (cancelled) {
            return;
          }

          if (data) {
            retryAttempt = 0;
            setConnectionMessage(null);
            scheduleNextRefresh(PANEL_VISIBLE_REFRESH_INTERVAL_MS);
            return;
          }

          retryAttempt += 1;
          const retryDelayMs = getRetryDelayMs(retryAttempt, 3000, 60000);
          setConnectionMessage(
            t("notices.connectionInterruptedRetry", {
              delay: formatRetryDelay(retryDelayMs),
            })
          );
          scheduleNextRefresh(retryDelayMs);
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleNextRefresh(PANEL_VISIBLE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [auth?.token, bootstrap, draggingItemId, props.apiBaseUrl]);

  function updateSearchFilters(
    updater: (current: PanelSearchFilters) => PanelSearchFilters
  ) {
    setSearchFiltersOverride((currentOverride) => {
      const next = updater(currentOverride ?? defaultSearchFilters);
      return arePanelSearchFiltersEqual(next, defaultSearchFilters)
        ? null
        : next;
    });
  }

  function resetSearchFilters() {
    setSearchFiltersOverride(null);
  }

  async function runSearch(
    query: string,
    filters: PanelSearchFilters = searchFilters
  ) {
    if (searchTabBlockedByRequestsOff) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      return;
    }

    if (!auth?.token) {
      return;
    }

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length > 0 && normalizedQuery.length < 3) {
      startTransition(() => {
        setSearchResults(null);
      });
      setSearchError(null);
      setSearching(false);
      return;
    }

    if (!canRunPanelSearch(normalizedQuery, filters)) {
      startTransition(() => {
        setSearchResults(null);
      });
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10",
      });
      if (normalizedQuery.length >= 3) {
        params.set("query", normalizedQuery);
      }
      appendPanelSearchFiltersToParams(params, filters);
      const results = await fetchExtensionJson<PanelSearchResponse>(
        auth.token,
        `/api/extension/search?${params.toString()}`,
        props.apiBaseUrl
      );

      if (latestSearchRequestRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        setSearchResults(results);
      });
    } catch (error) {
      if (latestSearchRequestRef.current !== requestId) {
        return;
      }

      setSearchError(getErrorText(error, t("search.searchFailed")));
    } finally {
      if (latestSearchRequestRef.current === requestId) {
        setSearching(false);
      }
    }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (searchTabBlockedByRequestsOff) {
      return;
    }

    const query = searchQuery.trim();
    if (!auth?.token) {
      return;
    }

    const submittedFilters = canonicalizePanelSearchFilters(searchFilters);
    setLastSubmittedSearchQuery(query);
    setLastSubmittedSearchFilters(submittedFilters);
    void runSearch(query, submittedFilters);
  }

  async function handleSubmitRequest(input: PanelViewerRequestSubmitInput) {
    if (!auth?.token) {
      return;
    }

    setPendingAction(getPanelViewerRequestActionKey(input));
    setTransientNotice(null);

    try {
      const endpoint = isEditingRequest
        ? "/api/extension/request/edit"
        : "/api/extension/request";
      const result = await fetchExtensionJson<{ message?: string }>(
        auth.token,
        endpoint,
        props.apiBaseUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...("songId" in input
              ? {
                  songId: input.songId,
                  requestMode: "catalog",
                  requestedPath: input.requestedPath,
                }
              : "query" in input
                ? {
                    query: input.query.trim(),
                    requestMode: input.requestMode,
                  }
                : {
                    requestMode: input.requestMode,
                  }),
            requestKind: input.requestKind,
            vipTokenCost: input.vipTokenCost,
            itemId: editingRequestItemId ?? undefined,
          }),
        }
      );

      showTransientNotice(
        "success",
        result.message ??
          (isEditingRequest ? t("requests.updated") : t("requests.added"))
      );
      await refreshPanelState({
        token: auth.token,
        cause: "viewer-request-success",
      });
      startTransition(() => {
        setEditingRequestItemId(null);
        setActiveTab("playlist");
      });
    } catch (error) {
      await refreshPanelState({
        token: auth.token,
        silent: true,
        cause: "viewer-request-failure",
      });
      showTransientNotice(
        "danger",
        getErrorText(error, t("notices.updateRequestFailed"))
      );
    } finally {
      setPendingAction(null);
    }
  }

  function handleEditRequest(itemId: string) {
    setExpandedActionItemId(null);
    setConfirmingRemoveItemId(null);
    setEditingRequestItemId(itemId);
    startTransition(() => {
      setActiveTab("search");
    });
  }

  async function handleRemoveRequest(itemId: string) {
    if (!auth?.token) {
      return;
    }

    setPendingAction(`remove:${itemId}`);
    setTransientNotice(null);

    try {
      const result = await fetchExtensionJson<{ message?: string }>(
        auth.token,
        "/api/extension/request/remove",
        props.apiBaseUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            itemId,
          }),
        }
      );

      showTransientNotice("success", result.message ?? t("requests.removed"));
      setConfirmingRemoveItemId(null);
      setExpandedActionItemId((current) =>
        current === itemId ? null : current
      );
      setEditingRequestItemId((current) =>
        current === itemId ? null : current
      );
      await refreshPanelState({
        token: auth.token,
        cause: "remove-request-success",
      });
    } catch (error) {
      await refreshPanelState({
        token: auth.token,
        silent: true,
        cause: "remove-request-failure",
      });
      showTransientNotice(
        "danger",
        getErrorText(error, t("notices.removeRequestFailed"))
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePlaylistMutation(mutation: PanelPlaylistMutation) {
    if (!auth?.token) {
      return;
    }

    const actionKey =
      "itemId" in mutation
        ? mutation.action === "changeRequestKind"
          ? `${mutation.action}:${mutation.itemId}:${mutation.requestKind}`
          : `${mutation.action}:${mutation.itemId}`
        : "songId" in mutation
          ? `${mutation.action}:${mutation.songId}`
          : mutation.action;

    setPendingAction(actionKey);
    setTransientNotice(null);

    try {
      const response = await fetchExtensionJson<PanelPlaylistMutationResponse>(
        auth.token,
        "/api/extension/playlist",
        props.apiBaseUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(mutation),
        }
      );

      if ("itemId" in mutation) {
        setConfirmingRemoveItemId((current) =>
          current === mutation.itemId ? null : current
        );
      }
      if (mutation.action !== "reorderItems") {
        setDropTargetState(null);
      }
      await refreshPanelState({
        token: auth.token,
        cause: "playlist-mutation-success",
      });

      if (mutation.action !== "reorderItems") {
        showTransientNotice(
          "success",
          getPlaylistMutationSuccessMessage(mutation, response, t)
        );
      }
    } catch (error) {
      await refreshPanelState({
        token: auth.token,
        silent: true,
        cause: "playlist-mutation-failure",
      });
      showTransientNotice(
        "danger",
        getErrorText(error, t("notices.updatePlaylistFailed"))
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleManagerManualAdd(item: Record<string, unknown>) {
    const songId = getString(item, "id");
    const title = getString(item, "title");
    const source = getString(item, "source");

    if (!songId || !title || !source) {
      showTransientNotice("danger", t("search.unavailable"));
      return;
    }

    await handlePlaylistMutation({
      action: "manualAdd",
      songId,
      requesterLogin: viewerProfile?.login,
      requesterTwitchUserId: viewerProfile?.twitchUserId,
      requesterDisplayName: viewerProfile?.displayName,
      title,
      authorId: getNumber(item, "authorId") ?? undefined,
      groupedProjectId: getNumber(item, "groupedProjectId") ?? undefined,
      artist: getString(item, "artist") ?? undefined,
      album: getString(item, "album") ?? undefined,
      creator: getString(item, "creator") ?? undefined,
      tuning: getString(item, "tuning") ?? undefined,
      parts: getStringArray(item, "parts") ?? undefined,
      durationText: getString(item, "durationText") ?? undefined,
      source,
      sourceUrl: getString(item, "sourceUrl") ?? undefined,
      sourceId: getNumber(item, "sourceId") ?? undefined,
      candidateMatchesJson: JSON.stringify([item]),
    });
  }

  function handleShufflePlaylist() {
    void handlePlaylistMutation({
      action: "shufflePlaylist",
    });
  }

  function handleReorderPlaylist(
    sourceItemId: string,
    targetItemId: string,
    edge: Edge
  ) {
    if (!bootstrap) {
      return;
    }

    const orderedQueuedItemIds = getReorderedPanelItemIds(
      bootstrap.playlist.items,
      bootstrap.playlist.currentItemId,
      sourceItemId,
      targetItemId,
      edge
    );

    if (!orderedQueuedItemIds) {
      return;
    }

    const optimisticOrderedItemIds = bootstrap.playlist.currentItemId
      ? [bootstrap.playlist.currentItemId, ...orderedQueuedItemIds]
      : orderedQueuedItemIds;

    startTransition(() => {
      setBootstrap((current) =>
        current
          ? {
              ...current,
              playlist: {
                ...current.playlist,
                items: orderPanelPlaylistItems(
                  current.playlist.items,
                  optimisticOrderedItemIds
                ),
              },
            }
          : current
      );
      setDropTargetState(null);
    });

    void handlePlaylistMutation({
      action: "reorderItems",
      orderedItemIds: orderedQueuedItemIds,
    });
  }

  function handleRequestIdentityShare() {
    getTwitchExtensionHelper()?.actions.requestIdShare();
  }

  const channelTitle = bootstrap?.channel?.displayName
    ? t("panel.titleWithChannel", {
        displayName: bootstrap.channel.displayName,
      })
    : t("panel.titleDefault");
  const footerPlaylistHref = bootstrap?.channel?.slug
    ? toExtensionAppUrl(`/${bootstrap.channel.slug}`, props.apiBaseUrl)
    : null;
  const footerPlaylistLabel = getPanelPlaylistFooterLabel(
    bootstrap?.channel?.displayName,
    t
  );
  const showStandaloneDemo =
    !auth &&
    typeof window !== "undefined" &&
    window.self === window.top &&
    (helperTimedOut || helperState === "error");

  if (showStandaloneDemo) {
    return <ExtensionPanelModeratorPreview />;
  }

  return (
    <TooltipProvider>
      <div className="mx-auto flex h-screen min-h-0 w-full max-w-[320px] flex-col overflow-hidden bg-(--panel)">
        <section className="border-b border-(--border-strong) px-3 py-2">
          {showLoadingSkeleton ? (
            <PanelHeaderSkeleton />
          ) : (
            <>
              <Collapsible
                open={vipHelpOpen}
                onOpenChange={setVipHelpOpen}
                className="min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-semibold text-(--text)">
                      {channelTitle}
                    </h1>
                    {viewerProfile ? (
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] leading-4 text-(--muted)">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex min-w-0 max-w-full items-center gap-1 text-left text-[11px] leading-4 text-(--brand-deep) underline decoration-dashed underline-offset-3"
                          >
                            <span className="truncate">
                              {formatVipTokensCompact(
                                viewerProfile.vipTokensAvailable,
                                t
                              )}
                            </span>
                            <CircleHelp className="h-3 w-3 shrink-0" />
                          </button>
                        </CollapsibleTrigger>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {formatRequestLimitCompact(
                            activeRequestCount,
                            activeRequestLimit,
                            t
                          )}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 truncate text-[11px] leading-4 text-(--muted)">
                        {bootstrap?.viewer.isLinked
                          ? translateExtensionMessage(
                              bootstrap.viewer.access.reason ??
                                t("panel.viewerStateLoading"),
                              t
                            )
                          : t("panel.shareIdentityToRequest")}
                      </p>
                    )}
                  </div>
                  <PanelLanguageSelect
                    locale={locale}
                    onLocaleChange={setPanelLocale}
                    isSavingLocale={isSavingLocale}
                  />
                </div>
                <CollapsibleContent className="mt-2 overflow-hidden border border-(--border) bg-(--panel) px-2.5 py-2">
                  <div className="grid gap-1.5 text-[11px] leading-4 text-(--muted)">
                    <p className="font-semibold text-(--text)">
                      {t("vip.redemptionDescription")}
                    </p>
                    <div className="grid gap-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--text)">
                        {t("vip.howToEarn")}
                      </p>
                      {vipTokenAutomationDetails.earningRules.length ? (
                        <div className="grid gap-1">
                          {vipTokenAutomationDetails.earningRules.map(
                            (rule) => (
                              <p key={rule}>{rule}</p>
                            )
                          )}
                        </div>
                      ) : (
                        <p>{t("vip.manualOnly")}</p>
                      )}
                      {vipTokenAutomationDetails.notes.map((note) => (
                        <p key={note}>{note}</p>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {!bootstrap?.viewer.isLinked ? (
                  <Button
                    size="sm"
                    className="h-7 rounded-none px-2 text-[11px] shadow-none"
                    onClick={handleRequestIdentityShare}
                    disabled={helperState !== "ready"}
                  >
                    {t("panel.shareIdentityButton")}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </section>

        {helperState === "error" ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />} tone="danger">
            {translateExtensionMessage(
              helperError ?? t("notices.helperLoadFailed"),
              t
            )}
          </PanelNotice>
        ) : null}

        {helperTimedOut && !auth ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />}>
            {t("notices.authorizationHint")}
          </PanelNotice>
        ) : null}

        {bootstrapError ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />} tone="danger">
            {translateExtensionMessage(bootstrapError, t)}
          </PanelNotice>
        ) : null}

        {connectionMessage && !bootstrapError ? (
          <PanelNotice
            icon={<LoaderCircle className="h-4 w-4 animate-spin" />}
            tone="default"
          >
            {translateExtensionMessage(connectionMessage, t)}
          </PanelNotice>
        ) : null}

        <AnimatePresence initial={false} mode="sync">
          {transientNotice ? (
            <TransientNoticeBanner
              key={transientNotice.id}
              tone={transientNotice.tone}
            >
              {translateExtensionMessage(transientNotice.message, t)}
            </TransientNoticeBanner>
          ) : null}
        </AnimatePresence>

        {bootstrap?.setup ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />}>
            {translateExtensionMessage(bootstrap.setup.message, t)}
          </PanelNotice>
        ) : null}
        {bootstrap?.channel && !channelRequestsOpen ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />}>
            {addRequestsWhenLiveMessage}
          </PanelNotice>
        ) : null}

        {showLoadingSkeleton ? (
          <PanelLoadingSkeleton />
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "playlist" || value === "search") {
                setActiveTab(value);
              }
            }}
            className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden border-b border-(--border-strong)"
          >
            <PanelRequestsStatusBar requestsEnabled={requestsEnabled} />
            <TabsList
              variant="line"
              className="grid h-auto w-full shrink-0 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0"
              style={{
                gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
              }}
            >
              <TabsTrigger
                value="playlist"
                className="h-auto min-w-0 justify-center rounded-none border-0 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
                style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
              >
                <span className="inline-flex min-w-0 items-center gap-0.5">
                  <span className="truncate">{t("queue.tab")}</span>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-current">
                    ({queueCount})
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="search"
                className="h-auto min-w-0 rounded-none border-0 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
                style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
              >
                {t("search.tab")}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="playlist"
              className="mt-0 min-h-0 flex-1 overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                {canManagePlaylist ? (
                  <div className="flex items-center justify-between border-t border-(--border) px-3 pt-2 pb-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      <span className="inline-flex h-4 w-4 items-center justify-center border border-emerald-700/50 bg-emerald-950 text-emerald-100">
                        <Sword className="h-2.5 w-2.5" />
                      </span>
                      <span>{t("queue.tools")}</span>
                    </span>
                    {showShufflePlaylistControl ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                              onClick={handleShufflePlaylist}
                              disabled={
                                !canShufflePlaylist ||
                                pendingAction === "shufflePlaylist"
                              }
                              aria-label={shufflePlaylistTooltip}
                            >
                              {pendingAction === "shufflePlaylist" ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Shuffle className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {shufflePlaylistTooltip}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
                {playlistItems.length ? (
                  playlistItems.map((item, index) => {
                    const itemId =
                      getString(item, "id") ?? `queue-item-${index}`;

                    return (
                      <PanelPlaylistRow
                        key={itemId}
                        item={item}
                        itemId={itemId}
                        currentItemId={currentPlaylistItemId}
                        showPlaylistPositions={showPlaylistPositions}
                        showPickOrderBadges={showPickOrderBadges}
                        viewerProfile={viewerProfile}
                        canManagePlaylist={canManagePlaylist}
                        canManageVipRequests={canManageVipRequests}
                        canReorderPlaylist={canReorderPlaylist}
                        pendingAction={pendingAction}
                        confirmingRemoveItemId={confirmingRemoveItemId}
                        onConfirmRemoveChange={setConfirmingRemoveItemId}
                        expandedActionItemId={expandedActionItemId}
                        onExpandedActionItemChange={setExpandedActionItemId}
                        removeConfirmRef={removeConfirmRef}
                        draggingItemId={draggingItemId}
                        dropTargetState={dropTargetState}
                        onDragStart={setDraggingItemId}
                        onDragEnd={() => {
                          setDraggingItemId(null);
                          setDropTargetState(null);
                        }}
                        onDragHover={(hoverItemId, edge) => {
                          setDropTargetState({
                            itemId: hoverItemId,
                            edge,
                          });
                        }}
                        onDragLeave={() => setDropTargetState(null)}
                        onReorder={handleReorderPlaylist}
                        editingRequestItemId={editingRequestItemId}
                        onEditRequest={handleEditRequest}
                        onRemoveRequest={handleRemoveRequest}
                        onPlaylistMutation={handlePlaylistMutation}
                      />
                    );
                  })
                ) : (
                  <div className="border-t border-(--border) px-3 py-2 text-[11px] text-(--muted)">
                    {t("queue.empty")}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent
              value="search"
              className="mt-0 min-h-0 flex-1 overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                <div className="border-b border-(--border) px-3 py-2">
                  {editingRequest ? (
                    <PanelSearchEditBanner
                      item={editingRequest}
                      onCancel={() => {
                        setEditingRequestItemId(null);
                        setActiveTab("playlist");
                      }}
                    />
                  ) : null}
                  {!searchTabBlockedByRequestsOff ? (
                    <>
                      <form
                        className="flex gap-1"
                        onSubmit={handleSearchSubmit}
                      >
                        <Input
                          value={searchQuery}
                          onChange={(event) =>
                            setSearchQuery(event.target.value)
                          }
                          spellCheck={false}
                          autoCorrect="off"
                          autoCapitalize="none"
                          placeholder={
                            editingRequest
                              ? t("search.placeholderEdit")
                              : t("search.placeholder")
                          }
                          className="h-8 border-(--border-strong) bg-(--panel) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          className="h-8 px-2 shadow-none"
                          disabled={
                            searching ||
                            !auth?.token ||
                            !canRunPanelSearch(searchQuery, searchFilters)
                          }
                        >
                          {searching ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </form>
                      <PanelSearchFiltersBar
                        filters={searchFilters}
                        onChange={updateSearchFilters}
                        onReset={resetSearchFilters}
                        showReset={searchFiltersChangedFromDefaults}
                      />

                      {showingSubmittedSearchState && searchError ? (
                        <p className="mt-2 text-[11px] text-(--danger)">
                          {translateExtensionMessage(searchError, t)}
                        </p>
                      ) : null}
                      {showSpecialRequestControls ? (
                        <PanelSpecialRequestControls
                          randomQuery={quickRandomQuery}
                          onRandomQueryChange={setQuickRandomQuery}
                          choiceQuery={quickChoiceQuery}
                          onChoiceQueryChange={setQuickChoiceQuery}
                          canRequest={canQuickRequest}
                          canVipRequest={canQuickVipRequest}
                          vipDisabledReason={quickVipDisabledReason}
                          pendingAction={pendingAction}
                          isEditingRequest={isEditingRequest}
                          onSubmit={(input) => {
                            void handleSubmitRequest(
                              input.requestMode === "favorite"
                                ? {
                                    requestMode: input.requestMode,
                                    requestKind: input.requestKind,
                                  }
                                : {
                                    query: input.query,
                                    requestMode: input.requestMode,
                                    requestKind: input.requestKind,
                                  }
                            );
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div>
                  {searchTabBlockedByRequestsOff ? (
                    <div className="border-t border-(--border) px-3 py-3 text-[11px] text-(--muted)">
                      {t("requests.offRightNow")}
                    </div>
                  ) : showingSubmittedSearchState &&
                    searchResults?.items?.length ? (
                    <div>
                      {searchResults.items.map((item, index) => {
                        const songId = getString(item, "id");
                        const managerActionKey = `${songId ?? "unknown"}:manualAdd`;
                        const managerIsOwner =
                          viewerProfile?.login?.trim().toLowerCase() ===
                          bootstrap?.channel?.login?.trim().toLowerCase();
                        const managerManualAddVipTokenCost = managerIsOwner
                          ? 0
                          : getRequestVipTokenPlan({
                              requestKind: "regular",
                              song: {
                                durationText:
                                  getString(item, "durationText") ?? undefined,
                              },
                              requestedPaths: [],
                              thresholds: vipTokenDurationThresholds,
                              settings: {
                                requestPathModifierVipTokenCost:
                                  bootstrap?.settings
                                    .requestPathModifierVipTokenCost ?? 0,
                                requestPathModifierVipTokenCosts: bootstrap
                                  ?.settings
                                  .requestPathModifierVipTokenCosts ?? {
                                  guitar: 0,
                                  lead: 0,
                                  rhythm: 0,
                                  bass: 0,
                                },
                                requestPathModifierUsesVipPriority:
                                  bootstrap?.settings
                                    .requestPathModifierUsesVipPriority ?? true,
                              },
                            }).totalVipTokenCost;
                        const managerAvailableVipTokenCount =
                          viewerProfile?.vipTokensAvailable ?? 0;
                        const managerHasInsufficientVipTokens =
                          managerManualAddVipTokenCost >
                          managerAvailableVipTokenCount;
                        const managerManualAddCostLabel =
                          getPanelManagerVipTokenStatusLabel({
                            requiredVipTokenCost: managerManualAddVipTokenCost,
                            availableVipTokenCount:
                              managerAvailableVipTokenCount,
                            t,
                          });

                        return (
                          <div
                            key={songId ?? `search-result-${index}`}
                            className="border-t border-(--border) px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                                  {formatSearchSongLabel(item, t)}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                                  {formatSearchSongMeta(item)}
                                </p>
                              </div>
                              {showManagerSearchActions ? (
                                <div className="grid shrink-0 justify-items-end gap-1 text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] leading-none shadow-none"
                                    disabled={
                                      !songId ||
                                      pendingAction === managerActionKey ||
                                      managerHasInsufficientVipTokens
                                    }
                                    title={
                                      managerHasInsufficientVipTokens
                                        ? managerManualAddCostLabel || undefined
                                        : undefined
                                    }
                                    onClick={() => {
                                      void handleManagerManualAdd(item);
                                    }}
                                  >
                                    {pendingAction === managerActionKey
                                      ? t("buttons.adding")
                                      : isEditingRequest
                                        ? t("buttons.edit")
                                        : t("buttons.add")}
                                  </Button>
                                  {managerManualAddCostLabel ? (
                                    <p className="text-[10px] leading-3.5 text-(--muted)">
                                      {managerManualAddCostLabel}
                                    </p>
                                  ) : null}
                                </div>
                              ) : showViewerSearchActions ? (
                                <PanelSearchSongActions
                                  item={item}
                                  canRequest={
                                    viewerRequestsAvailable &&
                                    !!bootstrap?.viewer.canRequest
                                  }
                                  canVipRequest={
                                    viewerRequestsAvailable &&
                                    !!bootstrap?.viewer.canVipRequest
                                  }
                                  requestUnavailableReason={
                                    !viewerRequestsAvailable
                                      ? addRequestsWhenLiveMessage
                                      : null
                                  }
                                  vipUnavailableReason={quickVipDisabledReason}
                                  viewerVipTokenCount={
                                    bootstrap?.viewer.profile
                                      ?.vipTokensAvailable ?? 0
                                  }
                                  editingRequest={editingRequest}
                                  pendingAction={pendingAction}
                                  allowRequestPathModifiers={
                                    bootstrap?.settings
                                      .allowRequestPathModifiers ?? false
                                  }
                                  allowedRequestPaths={
                                    bootstrap?.settings?.allowedRequestPaths ??
                                    []
                                  }
                                  requestPathModifierVipTokenCost={
                                    bootstrap?.settings
                                      .requestPathModifierVipTokenCost ?? 0
                                  }
                                  requestPathModifierVipTokenCosts={
                                    bootstrap?.settings
                                      ?.requestPathModifierVipTokenCosts ?? {
                                      guitar: 0,
                                      lead: 0,
                                      rhythm: 0,
                                      bass: 0,
                                    }
                                  }
                                  requestPathModifierUsesVipPriority={
                                    bootstrap?.settings
                                      .requestPathModifierUsesVipPriority ??
                                    true
                                  }
                                  vipTokenDurationThresholds={
                                    vipTokenDurationThresholds
                                  }
                                  onSubmit={(requestInput) => {
                                    void handleSubmitRequest(requestInput);
                                  }}
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : showingSubmittedSearchState &&
                    canRunPanelSearch(searchQuery, searchFilters) &&
                    !searching &&
                    !searchError ? (
                    <div className="border-t border-(--border) px-3 py-2 text-[11px] text-(--muted)">
                      {t("search.noResults")}
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
        {footerPlaylistHref ? (
          <PanelPlaylistFooterLink
            href={footerPlaylistHref}
            label={footerPlaylistLabel}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

export function ExtensionPanelModeratorPreview() {
  const { t } = useLocaleTranslation("extension");
  const [playlist, setPlaylist] = useState<PanelDemoPlaylist>({
    currentItemId: "preview-current",
    items: createMockModeratorPlaylistItems(),
  });
  const [transientNotice, setTransientNotice] =
    useState<TransientPanelNotice | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmingRemoveItemId, setConfirmingRemoveItemId] = useState<
    string | null
  >(null);
  const [expandedActionItemId, setExpandedActionItemId] = useState<
    string | null
  >(null);
  const [editingRequestItemId, setEditingRequestItemId] = useState<
    string | null
  >(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetState, setDropTargetState] =
    useState<PanelDropTargetState>(null);
  const [activeTab, setActiveTab] = useState<"playlist" | "search">("playlist");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickRandomQuery, setQuickRandomQuery] = useState("");
  const [quickChoiceQuery, setQuickChoiceQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState<PanelSearchFilters>(() =>
    createPanelSearchFilters({
      parts: ["lead", "bass"],
      partsMatchMode: "any",
    })
  );
  const [searchResults, setSearchResults] =
    useState<PanelSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [lastSubmittedSearchQuery, setLastSubmittedSearchQuery] = useState<
    string | null
  >(null);
  const [lastSubmittedSearchFilters, setLastSubmittedSearchFilters] =
    useState<PanelSearchFilters | null>(null);
  const latestTransientNoticeIdRef = useRef(0);
  const latestSearchRequestRef = useRef(0);
  const removeConfirmRef = useRef<HTMLDivElement | null>(null);
  const defaultSearchFilters = useMemo(
    () =>
      createPanelSearchFilters({
        parts: ["lead", "bass"],
        partsMatchMode: "any",
      }),
    []
  );

  const activeRequests = getDemoViewerActiveRequests(
    playlist,
    mockModeratorViewerProfile.twitchUserId
  );
  const activeRequestCount = activeRequests.length;
  const activeRequestLimit = mockModeratorViewerProfile.activeRequestLimit;
  const currentPlaylistItemId = playlist.currentItemId;
  const queueCount = playlist.items.length;
  const previewChannelSlug = "jimmy-pants";
  const showPlaylistPositions = false;
  const showPickOrderBadges = false;
  const footerPlaylistHref = toExtensionAppUrl("/jimmy-pants");
  const footerPlaylistLabel = getPanelPlaylistFooterLabel("Jimmy Pants_", t);
  const queuedPlaylistItems = playlist.items.filter(
    (item) => getString(item, "id") !== currentPlaylistItemId
  );
  const canReorderPlaylist = queuedPlaylistItems.length > 1;
  const showShufflePlaylistControl = queuedPlaylistItems.length > 1;
  const canShufflePlaylist =
    showShufflePlaylistControl && currentPlaylistItemId == null;
  const shufflePlaylistTooltip = currentPlaylistItemId
    ? t("queue.shuffleBlocked")
    : t("queue.shuffle");
  const vipSearchDisabledReason =
    mockModeratorViewerProfile.vipTokensAvailable < 1
      ? t("vip.notEnough")
      : null;
  const vipTokenDurationThresholds: VipTokenDurationThreshold[] = [];
  const editingRequest = getViewerEditablePanelItem(
    playlist.items,
    mockModeratorViewerProfile,
    editingRequestItemId
  );
  const isEditingRequest = editingRequest != null;
  const searchFiltersChangedFromDefaults = !arePanelSearchFiltersEqual(
    searchFilters,
    defaultSearchFilters
  );
  const showingSubmittedSearchState =
    lastSubmittedSearchQuery != null &&
    lastSubmittedSearchFilters != null &&
    lastSubmittedSearchQuery === searchQuery.trim() &&
    arePanelSearchFiltersEqual(lastSubmittedSearchFilters, searchFilters);

  useEffect(() => {
    if (!transientNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransientNotice((current) =>
        current?.id === transientNotice.id ? null : current
      );
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [transientNotice]);

  useEffect(() => {
    if (!confirmingRemoveItemId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        removeConfirmRef.current &&
        !removeConfirmRef.current.contains(target)
      ) {
        setConfirmingRemoveItemId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [confirmingRemoveItemId]);

  useEffect(() => {
    if (editingRequestItemId && !editingRequest) {
      setEditingRequestItemId(null);
    }
  }, [editingRequest, editingRequestItemId]);

  useEffect(() => {
    if (getString(editingRequest ?? {}, "warningCode") !== "streamer_choice") {
      return;
    }

    setQuickChoiceQuery(
      getString(editingRequest ?? {}, "requestedQuery") ?? ""
    );
  }, [editingRequest]);

  function showTransientMessage(
    tone: TransientPanelNotice["tone"],
    message: string
  ) {
    latestTransientNoticeIdRef.current += 1;
    setTransientNotice({
      id: latestTransientNoticeIdRef.current,
      tone,
      message,
    });
  }

  function applyPreviewPlaylistMutation(
    current: PanelDemoPlaylist,
    mutation: PanelPlaylistMutation
  ) {
    switch (mutation.action) {
      case "setCurrent": {
        const nextPositions = getUpdatedPositionsAfterSetCurrent({
          items: current.items.map((item) => ({
            id: getString(item, "id") ?? "",
            position: getNumber(item, "position") ?? 0,
            regularPosition: getNumber(item, "regularPosition"),
            status: getString(item, "status") ?? "queued",
            requestKind: getString(item, "requestKind"),
          })),
          targetItemId: mutation.itemId,
        });
        const nextPositionById = new Map(
          nextPositions.map((item) => [item.id, item.position])
        );

        if (!nextPositionById.has(mutation.itemId)) {
          return current;
        }

        return {
          currentItemId: mutation.itemId,
          items: current.items
            .map((item) => {
              const itemId = getString(item, "id");

              return {
                ...item,
                position: itemId
                  ? (nextPositionById.get(itemId) ??
                    getNumber(item, "position"))
                  : getNumber(item, "position"),
                status: itemId === mutation.itemId ? "current" : "queued",
              };
            })
            .sort(
              (left, right) =>
                (getNumber(left, "position") ?? 0) -
                (getNumber(right, "position") ?? 0)
            ),
        };
      }
      case "returnToQueue": {
        if (current.currentItemId !== mutation.itemId) {
          return current;
        }

        const nextPositions = getQueuedPositionsFromRegularOrder(
          current.items.map((item) => ({
            id: getString(item, "id") ?? "",
            position: getNumber(item, "position") ?? 0,
            regularPosition: getNumber(item, "regularPosition"),
            status: getString(item, "status") ?? "queued",
            requestKind: getString(item, "requestKind"),
          }))
        );
        const nextPositionById = new Map(
          nextPositions.map((item) => [item.id, item.position])
        );

        return {
          currentItemId: null,
          items: current.items
            .map((item) => {
              const itemId = getString(item, "id");

              return {
                ...item,
                position: itemId
                  ? (nextPositionById.get(itemId) ??
                    getNumber(item, "position"))
                  : getNumber(item, "position"),
                status: "queued",
              };
            })
            .sort(
              (left, right) =>
                (getNumber(left, "position") ?? 0) -
                (getNumber(right, "position") ?? 0)
            ),
        };
      }
      case "markPlayed":
      case "deleteItem": {
        const remainingItems = current.items.filter(
          (item) => getString(item, "id") !== mutation.itemId
        );
        const nextCurrentItemId =
          current.currentItemId === mutation.itemId
            ? null
            : current.currentItemId;

        return {
          currentItemId: nextCurrentItemId,
          items: remainingItems.map((item, index) => ({
            ...item,
            position: index + 1,
            status:
              getString(item, "id") === nextCurrentItemId
                ? "current"
                : "queued",
          })),
        };
      }
      case "changeRequestKind":
        return {
          ...current,
          items: (() => {
            const nextPositions = getUpdatedQueuedPositionsAfterKindChange({
              items: current.items.map((item) => ({
                id: getString(item, "id") ?? "",
                position: getNumber(item, "position") ?? 0,
                regularPosition: getNumber(item, "regularPosition"),
                status: getString(item, "status") ?? "queued",
                requestKind:
                  getString(item, "id") === mutation.itemId
                    ? mutation.requestKind
                    : getString(item, "requestKind"),
              })),
              playlistCurrentItemId: current.currentItemId,
              targetItemId: mutation.itemId,
              requestKind: mutation.requestKind,
            });
            const nextPositionById = new Map(
              nextPositions.map((item) => [item.id, item.position])
            );

            return current.items
              .map((item) => {
                const itemId = getString(item, "id");
                return {
                  ...item,
                  position: itemId
                    ? (nextPositionById.get(itemId) ??
                      getNumber(item, "position"))
                    : getNumber(item, "position"),
                  requestKind:
                    itemId === mutation.itemId
                      ? mutation.requestKind
                      : item.requestKind,
                };
              })
              .sort(
                (left, right) =>
                  (getNumber(left, "position") ?? 0) -
                  (getNumber(right, "position") ?? 0)
              );
          })(),
        };
      case "shufflePlaylist": {
        const currentItem = current.currentItemId
          ? (current.items.find(
              (item) => getString(item, "id") === current.currentItemId
            ) ?? null)
          : null;
        const shuffledQueued = current.items.filter(
          (item) => getString(item, "id") !== current.currentItemId
        );

        for (let index = shuffledQueued.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [shuffledQueued[index], shuffledQueued[swapIndex]] = [
            shuffledQueued[swapIndex],
            shuffledQueued[index],
          ];
        }

        return {
          currentItemId: current.currentItemId,
          items: [currentItem, ...shuffledQueued]
            .filter((item): item is PanelPlaylistItem => Boolean(item))
            .map((item, index) => ({
              ...item,
              position: index + 1,
              status:
                getString(item, "id") === current.currentItemId
                  ? "current"
                  : "queued",
            })),
        };
      }
      case "reorderItems": {
        const orderedItemIds = current.currentItemId
          ? [current.currentItemId, ...mutation.orderedItemIds]
          : mutation.orderedItemIds;

        return {
          currentItemId: current.currentItemId,
          items: orderPanelPlaylistItems(current.items, orderedItemIds).map(
            (item) => ({
              ...item,
              status:
                getString(item, "id") === current.currentItemId
                  ? "current"
                  : "queued",
            })
          ),
        };
      }
      default:
        return current;
    }
  }

  function resetSearchFilters() {
    setSearchFilters(defaultSearchFilters);
  }

  async function runPreviewSearch(
    query: string,
    filters: PanelSearchFilters = searchFilters
  ) {
    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length > 0 && normalizedQuery.length < 3) {
      startTransition(() => {
        setSearchResults(null);
      });
      setSearchError(null);
      setSearching(false);
      return;
    }

    if (!canRunPanelSearch(normalizedQuery, filters)) {
      startTransition(() => {
        setSearchResults(null);
      });
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        channelSlug: previewChannelSlug,
        page: "1",
        pageSize: "35",
      });
      if (normalizedQuery.length >= 3) {
        params.set("query", normalizedQuery);
      }
      appendPanelSearchFiltersToParams(params, filters);

      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response
        .json()
        .catch(() => null)) as PreviewCatalogSearchResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? t("search.searchFailed"));
      }

      if (latestSearchRequestRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        setSearchResults({
          items: payload?.results ?? [],
          total: payload?.total ?? 0,
          page: payload?.page ?? 1,
          pageSize: payload?.pageSize ?? 35,
          totalPages:
            payload?.pageSize && payload.total != null
              ? Math.ceil(payload.total / payload.pageSize)
              : 0,
        });
      });
    } catch (error) {
      if (latestSearchRequestRef.current !== requestId) {
        return;
      }

      setSearchError(getErrorText(error, t("search.searchFailed")));
    } finally {
      if (latestSearchRequestRef.current === requestId) {
        setSearching(false);
      }
    }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    const submittedFilters = canonicalizePanelSearchFilters(searchFilters);
    setLastSubmittedSearchQuery(query);
    setLastSubmittedSearchFilters(submittedFilters);
    void runPreviewSearch(query, submittedFilters);
  }

  async function fetchPreviewSearchPage(input: {
    query?: string;
    field?: "any" | "artist";
    page: number;
    pageSize: number;
  }) {
    const params = new URLSearchParams({
      channelSlug: previewChannelSlug,
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    const normalizedQuery = input.query?.trim() ?? "";

    if (normalizedQuery.length > 0) {
      params.set("query", normalizedQuery);
    }
    if (input.field) {
      params.set("field", input.field);
    }

    const response = await fetch(`/api/search?${params.toString()}`);
    const payload = (await response
      .json()
      .catch(() => null)) as PreviewCatalogSearchResponse | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? t("search.searchFailed"));
    }

    return payload;
  }

  async function resolvePreviewRandomSong(query: string) {
    const firstPage = await fetchPreviewSearchPage({
      query,
      field: "artist",
      page: 1,
      pageSize: 1,
    });
    const total = Math.max(
      0,
      firstPage?.total ?? firstPage?.results?.length ?? 0
    );

    if (total === 0) {
      return null;
    }

    const randomPageNumber = Math.floor(Math.random() * total) + 1;
    const randomPage = await fetchPreviewSearchPage({
      query,
      field: "artist",
      page: randomPageNumber,
      pageSize: 1,
    });

    return randomPage?.results?.[0] ?? null;
  }

  async function handleSubmitRequest(input: PanelViewerRequestSubmitInput) {
    const normalizedQuery =
      "query" in input && typeof input.query === "string"
        ? input.query.trim()
        : null;
    let song =
      "songId" in input
        ? (searchResults?.items.find(
            (item) => getString(item, "id") === input.songId
          ) ?? null)
        : null;

    if ("songId" in input && !song) {
      showTransientMessage("danger", t("search.unavailable"));
      return;
    }

    if (input.requestMode === "choice" && !normalizedQuery) {
      showTransientMessage("danger", t("search.typeArtistOrSong"));
      return;
    }

    if (
      !isEditingRequest &&
      activeRequestLimit != null &&
      activeRequestCount >= activeRequestLimit
    ) {
      showTransientMessage(
        "danger",
        t("requests.limitReached", {
          count: activeRequestLimit,
        })
      );
      return;
    }

    setPendingAction(getPanelViewerRequestActionKey(input));
    setTransientNotice(null);

    try {
      if (input.requestMode === "random") {
        song = await resolvePreviewRandomSong(normalizedQuery ?? "");
        if (!song) {
          showTransientMessage("danger", t("search.unavailable"));
          return;
        }
      }

      startTransition(() => {
        setPlaylist((current) =>
          applyDemoViewerRequestMutation({
            playlist: current,
            viewerProfile: mockModeratorViewerProfile,
            ...("songId" in input || input.requestMode === "random"
              ? {
                  song: song as Record<string, unknown>,
                  requestMode: "catalog",
                  requestedPath:
                    "songId" in input ? input.requestedPath : undefined,
                }
              : "query" in input
                ? {
                    query: normalizedQuery ?? "",
                    requestMode: input.requestMode,
                  }
                : {
                    requestMode: input.requestMode,
                  }),
            requestKind: input.requestKind,
            vipTokenCost: input.vipTokenCost,
            replaceExisting: false,
            replaceItemId: editingRequestItemId ?? undefined,
          })
        );
        setEditingRequestItemId(null);
        setActiveTab("playlist");
      });

      showTransientMessage(
        "success",
        isEditingRequest ? t("requests.updated") : t("requests.added")
      );
    } catch (error) {
      showTransientMessage(
        "danger",
        getErrorText(error, t("search.searchFailed"))
      );
    } finally {
      setPendingAction(null);
    }
  }

  function handleEditRequest(itemId: string) {
    setExpandedActionItemId(null);
    setConfirmingRemoveItemId(null);
    setEditingRequestItemId(itemId);
    startTransition(() => {
      setActiveTab("search");
    });
  }

  async function handlePlaylistMutation(mutation: PanelPlaylistMutation) {
    const actionKey =
      "itemId" in mutation
        ? mutation.action === "changeRequestKind"
          ? `${mutation.action}:${mutation.itemId}:${mutation.requestKind}`
          : `${mutation.action}:${mutation.itemId}`
        : mutation.action;

    setPendingAction(actionKey);
    setTransientNotice(null);

    startTransition(() => {
      setPlaylist((current) => applyPreviewPlaylistMutation(current, mutation));
      if ("itemId" in mutation) {
        setConfirmingRemoveItemId((current) =>
          current === mutation.itemId ? null : current
        );
      }
      if (mutation.action !== "reorderItems") {
        setDropTargetState(null);
      }
    });

    if (mutation.action !== "reorderItems") {
      showTransientMessage(
        "success",
        getPlaylistMutationSuccessMessage(
          mutation,
          {
            ok: true,
          },
          t
        )
      );
    }

    setPendingAction(null);
  }

  async function handleRemoveRequest(itemId: string) {
    setExpandedActionItemId((current) => (current === itemId ? null : current));
    setEditingRequestItemId((current) => (current === itemId ? null : current));
    await handlePlaylistMutation({
      action: "deleteItem",
      itemId,
    });
  }

  function handleShufflePlaylist() {
    void handlePlaylistMutation({
      action: "shufflePlaylist",
    });
  }

  function handleReorderPlaylist(
    sourceItemId: string,
    targetItemId: string,
    edge: Edge
  ) {
    const orderedQueuedItemIds = getReorderedPanelItemIds(
      playlist.items,
      playlist.currentItemId,
      sourceItemId,
      targetItemId,
      edge
    );

    if (!orderedQueuedItemIds) {
      return;
    }

    startTransition(() => {
      setPlaylist((current) =>
        applyPreviewPlaylistMutation(current, {
          action: "reorderItems",
          orderedItemIds: orderedQueuedItemIds,
        })
      );
      setDropTargetState(null);
    });

    setPendingAction("reorderItems");
    window.setTimeout(() => {
      setPendingAction(null);
    }, 120);
  }

  return (
    <TooltipProvider>
      <div className="mx-auto flex h-[560px] min-h-0 w-full max-w-[320px] flex-col overflow-hidden border border-(--border-strong) bg-(--panel)">
        <section className="border-b border-(--border-strong) px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-(--text)">
                {t("panel.titleWithChannel", {
                  displayName: "Jimmy Pants_",
                })}
              </h1>
              <p className="mt-1 truncate text-[11px] text-(--muted)">
                {formatVipTokensCompact(
                  mockModeratorViewerProfile.vipTokensAvailable,
                  t
                )}{" "}
                ·{" "}
                {formatRequestLimitCompact(
                  activeRequestCount,
                  activeRequestLimit,
                  t
                )}
              </p>
            </div>
            <PreviewPanelLanguageSelect />
          </div>
        </section>

        <AnimatePresence initial={false}>
          {transientNotice ? (
            <TransientNoticeBanner
              key={transientNotice.id}
              tone={transientNotice.tone}
            >
              {translateExtensionMessage(transientNotice.message, t)}
            </TransientNoticeBanner>
          ) : null}
        </AnimatePresence>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "playlist" || value === "search") {
              setActiveTab(value);
            }
          }}
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden border-b border-(--border-strong)"
        >
          <PanelRequestsStatusBar requestsEnabled />
          <TabsList
            variant="line"
            className="grid h-auto w-full shrink-0 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0"
            style={{
              gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
            }}
          >
            <TabsTrigger
              value="playlist"
              className="h-auto min-w-0 justify-center rounded-none border-0 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <span className="truncate">{t("queue.tab")}</span>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-current">
                  ({queueCount})
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="h-auto min-w-0 rounded-none border-0 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              {t("search.tab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="playlist"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <div className="h-full overflow-y-auto">
              {showShufflePlaylistControl ? (
                <div className="flex items-center justify-between border-t border-(--border) px-3 pt-2 pb-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                    <span className="inline-flex h-4 w-4 items-center justify-center border border-emerald-700/50 bg-emerald-950 text-emerald-100">
                      <Sword className="h-2.5 w-2.5" />
                    </span>
                    <span>{t("queue.tools")}</span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                          onClick={handleShufflePlaylist}
                          disabled={
                            !canShufflePlaylist ||
                            pendingAction === "shufflePlaylist"
                          }
                          aria-label={shufflePlaylistTooltip}
                        >
                          {pendingAction === "shufflePlaylist" ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Shuffle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{shufflePlaylistTooltip}</TooltipContent>
                  </Tooltip>
                </div>
              ) : null}

              {playlist.items.map((item, index) => {
                const itemId = getString(item, "id") ?? `preview-item-${index}`;

                return (
                  <PanelPlaylistRow
                    key={itemId}
                    item={item}
                    itemId={itemId}
                    currentItemId={playlist.currentItemId}
                    showPlaylistPositions={showPlaylistPositions}
                    showPickOrderBadges={showPickOrderBadges}
                    viewerProfile={mockModeratorViewerProfile}
                    canManagePlaylist
                    canManageVipRequests
                    canReorderPlaylist={canReorderPlaylist}
                    pendingAction={pendingAction}
                    confirmingRemoveItemId={confirmingRemoveItemId}
                    onConfirmRemoveChange={setConfirmingRemoveItemId}
                    expandedActionItemId={expandedActionItemId}
                    onExpandedActionItemChange={setExpandedActionItemId}
                    removeConfirmRef={removeConfirmRef}
                    draggingItemId={draggingItemId}
                    dropTargetState={dropTargetState}
                    onDragStart={setDraggingItemId}
                    onDragEnd={() => {
                      setDraggingItemId(null);
                      setDropTargetState(null);
                    }}
                    onDragHover={(hoverItemId, edge) => {
                      setDropTargetState({
                        itemId: hoverItemId,
                        edge,
                      });
                    }}
                    onDragLeave={() => setDropTargetState(null)}
                    onReorder={handleReorderPlaylist}
                    editingRequestItemId={editingRequestItemId}
                    onEditRequest={handleEditRequest}
                    onRemoveRequest={handleRemoveRequest}
                    onPlaylistMutation={handlePlaylistMutation}
                  />
                );
              })}
            </div>
          </TabsContent>

          <TabsContent
            value="search"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <div className="h-full overflow-y-auto">
              <div className="border-b border-(--border) px-3 py-2">
                {editingRequest ? (
                  <PanelSearchEditBanner
                    item={editingRequest}
                    onCancel={() => {
                      setEditingRequestItemId(null);
                      setActiveTab("playlist");
                    }}
                  />
                ) : null}
                <form className="flex gap-1" onSubmit={handleSearchSubmit}>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    placeholder={
                      editingRequest
                        ? t("search.placeholderEdit")
                        : t("search.placeholder")
                    }
                    className="h-8 border-(--border-strong) bg-(--panel) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 px-2 shadow-none"
                    disabled={
                      searching ||
                      !canRunPanelSearch(searchQuery, searchFilters)
                    }
                  >
                    {searching ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </form>
                <PanelSearchFiltersBar
                  filters={searchFilters}
                  onChange={(updater) =>
                    setSearchFilters((current) => updater(current))
                  }
                  onReset={resetSearchFilters}
                  showReset={searchFiltersChangedFromDefaults}
                />

                {showingSubmittedSearchState && searchError ? (
                  <p className="mt-2 text-[11px] text-(--danger)">
                    {translateExtensionMessage(searchError, t)}
                  </p>
                ) : null}
                <PanelSpecialRequestControls
                  randomQuery={quickRandomQuery}
                  onRandomQueryChange={setQuickRandomQuery}
                  choiceQuery={quickChoiceQuery}
                  onChoiceQueryChange={setQuickChoiceQuery}
                  canRequest
                  canVipRequest={
                    mockModeratorViewerProfile.vipTokensAvailable >= 1
                  }
                  vipDisabledReason={vipSearchDisabledReason}
                  pendingAction={pendingAction}
                  isEditingRequest={isEditingRequest}
                  onSubmit={(input) => {
                    void handleSubmitRequest(
                      input.requestMode === "favorite"
                        ? {
                            requestMode: input.requestMode,
                            requestKind: input.requestKind,
                          }
                        : {
                            query: input.query,
                            requestMode: input.requestMode,
                            requestKind: input.requestKind,
                          }
                    );
                  }}
                />
              </div>

              <div>
                {showingSubmittedSearchState && searchResults?.items?.length ? (
                  <div>
                    {searchResults.items.map((item, index) => {
                      const songId = getString(item, "id");

                      return (
                        <div
                          key={songId ?? `preview-search-result-${index}`}
                          className="border-t border-(--border) px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                                {formatSearchSongLabel(item, t)}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                                {formatSearchSongMeta(item)}
                              </p>
                            </div>
                            <PanelSearchSongActions
                              item={item}
                              canRequest
                              canVipRequest={
                                mockModeratorViewerProfile.vipTokensAvailable >=
                                1
                              }
                              vipUnavailableReason={vipSearchDisabledReason}
                              viewerVipTokenCount={
                                mockModeratorViewerProfile.vipTokensAvailable
                              }
                              editingRequest={editingRequest}
                              pendingAction={pendingAction}
                              allowRequestPathModifiers
                              allowedRequestPaths={["lead", "rhythm", "bass"]}
                              requestPathModifierVipTokenCost={1}
                              requestPathModifierVipTokenCosts={{
                                guitar: 0,
                                lead: 1,
                                rhythm: 1,
                                bass: 1,
                              }}
                              requestPathModifierUsesVipPriority
                              vipTokenDurationThresholds={
                                vipTokenDurationThresholds
                              }
                              onSubmit={(requestInput) => {
                                void handleSubmitRequest(requestInput);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : showingSubmittedSearchState &&
                  canRunPanelSearch(searchQuery, searchFilters) &&
                  !searching &&
                  !searchError ? (
                  <div className="border-t border-(--border) px-3 py-2 text-[11px] text-(--muted)">
                    {t("search.noResults")}
                  </div>
                ) : null}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <PanelPlaylistFooterLink
          href={footerPlaylistHref}
          label={footerPlaylistLabel}
        />
      </div>
    </TooltipProvider>
  );
}

function PanelPlaylistRow(props: {
  item: PanelPlaylistItem;
  itemId: string;
  currentItemId: string | null;
  showPlaylistPositions: boolean;
  showPickOrderBadges: boolean;
  viewerProfile: PanelBootstrapResponse["viewer"]["profile"];
  canManagePlaylist: boolean;
  canManageVipRequests: boolean;
  canReorderPlaylist: boolean;
  pendingAction: string | null;
  confirmingRemoveItemId: string | null;
  onConfirmRemoveChange: (itemId: string | null) => void;
  expandedActionItemId: string | null;
  onExpandedActionItemChange: (itemId: string | null) => void;
  removeConfirmRef: RefObject<HTMLDivElement | null>;
  draggingItemId: string | null;
  dropTargetState: PanelDropTargetState;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragHover: (itemId: string, edge: Edge) => void;
  onDragLeave: () => void;
  onReorder: (sourceItemId: string, targetItemId: string, edge: Edge) => void;
  editingRequestItemId: string | null;
  onEditRequest: (itemId: string) => void;
  onRemoveRequest: (itemId: string) => Promise<void>;
  onPlaylistMutation: (mutation: PanelPlaylistMutation) => Promise<void>;
}) {
  const { t } = useLocaleTranslation("extension");
  const itemRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const isCurrent = props.itemId === props.currentItemId;
  const isViewerRequest = isViewerOwnedActivePanelItem(
    props.item,
    props.viewerProfile
  );
  const playlistPosition = props.showPlaylistPositions
    ? getNumber(props.item, "position")
    : null;
  const pickNumber = props.showPickOrderBadges
    ? getNumber(props.item, "pickNumber")
    : null;
  const isVipRequest = getString(props.item, "requestKind") === "vip";
  const isEditingRequest = props.editingRequestItemId === props.itemId;
  const removeActionKey = `remove:${props.itemId}`;
  const deleteActionKey = `deleteItem:${props.itemId}`;
  const setCurrentActionKey = `setCurrent:${props.itemId}`;
  const returnToQueueActionKey = `returnToQueue:${props.itemId}`;
  const markPlayedActionKey = `markPlayed:${props.itemId}`;
  const nextRequestKind = isVipRequest ? "regular" : "vip";
  const changeRequestKindActionKey = `changeRequestKind:${props.itemId}:${nextRequestKind}`;
  const canEditOwnRequest = isViewerRequest && !isCurrent;
  const canDeleteItem =
    !isCurrent && (props.canManagePlaylist || isViewerRequest);
  const canShowSetCurrent = props.canManagePlaylist && !isCurrent;
  const isSetCurrentDisabled =
    props.pendingAction === setCurrentActionKey || props.currentItemId != null;
  const canReturnToQueue = props.canManagePlaylist && isCurrent;
  const canMarkPlayed = props.canManagePlaylist && isCurrent;
  const hasVipToggleAccess =
    !!props.canManageVipRequests && !!getString(props.item, "requestedByLogin");
  const canMakeRegular = hasVipToggleAccess && isVipRequest && !isCurrent;
  const canMakeVip = hasVipToggleAccess && !isVipRequest && !isCurrent;
  const canToggleVipRequest = canMakeRegular || canMakeVip;
  const canOpenModeratorActions =
    props.canManagePlaylist &&
    (canToggleVipRequest ||
      canShowSetCurrent ||
      canReturnToQueue ||
      canMarkPlayed ||
      canDeleteItem);
  const canOpenViewerActions = canEditOwnRequest || canDeleteItem;
  const canOpenActionTray =
    canOpenModeratorActions ||
    (!props.canManagePlaylist && canOpenViewerActions);
  const isActionTrayOpen = props.expandedActionItemId === props.itemId;
  const confirmingRemove = props.confirmingRemoveItemId === props.itemId;
  const canReorder = props.canReorderPlaylist && !isCurrent;
  const isDragging = props.draggingItemId === props.itemId;
  const dropEdge =
    props.dropTargetState?.itemId === props.itemId
      ? props.dropTargetState.edge
      : null;
  useEffect(() => {
    const element = itemRef.current;
    const dragHandle = dragHandleRef.current;

    if (!props.canReorderPlaylist || !element || !dragHandle) {
      return;
    }

    return draggable({
      element,
      dragHandle,
      canDrag: () => canReorder,
      getInitialData: () => ({
        type: "panel-playlist-item",
        itemId: props.itemId,
      }),
      onDragStart: () => {
        props.onDragStart(props.itemId);
      },
      onDrop: () => {
        props.onDragEnd();
      },
    });
  }, [
    canReorder,
    props.canReorderPlaylist,
    props.itemId,
    props.onDragEnd,
    props.onDragStart,
  ]);

  useEffect(() => {
    const element = itemRef.current;

    if (!props.canReorderPlaylist || !element) {
      return;
    }

    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        canReorder &&
        source.data.type === "panel-playlist-item" &&
        source.data.itemId !== props.itemId,
      getData: ({ input, element }) =>
        getPanelPlaylistDragData({
          itemId: props.itemId,
          element: element as HTMLElement,
          input,
        }),
      onDragEnter: ({ self }) => {
        const edge = extractClosestEdge(self.data);
        if (edge) {
          props.onDragHover(props.itemId, edge);
        }
      },
      onDrag: ({ self }) => {
        const edge = extractClosestEdge(self.data);
        if (edge) {
          props.onDragHover(props.itemId, edge);
        }
      },
      onDragLeave: () => {
        props.onDragLeave();
      },
      onDrop: ({ source, self }) => {
        const edge = extractClosestEdge(self.data);
        const sourceItemId =
          typeof source.data.itemId === "string" ? source.data.itemId : null;

        if (!edge || !sourceItemId) {
          props.onDragEnd();
          return;
        }

        props.onReorder(sourceItemId, props.itemId, edge);
        props.onDragEnd();
      },
    });
  }, [
    canReorder,
    props.canReorderPlaylist,
    props.itemId,
    props.onDragEnd,
    props.onDragHover,
    props.onDragLeave,
    props.onReorder,
  ]);

  useEffect(() => {
    if (!isActionTrayOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        itemRef.current &&
        !itemRef.current.contains(target)
      ) {
        props.onExpandedActionItemChange(null);
        props.onConfirmRemoveChange(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [
    isActionTrayOpen,
    props.itemId,
    props.onConfirmRemoveChange,
    props.onExpandedActionItemChange,
  ]);

  return (
    <motion.div
      ref={itemRef}
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.7 : 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{
        layout: {
          duration: 0.24,
          ease: [0.2, 0, 0, 1],
        },
        duration: 0.18,
      }}
      className="relative border-t border-(--border)"
      style={
        isEditingRequest
          ? {
              borderColor: "var(--brand)",
              backgroundColor: "var(--brand-soft)",
            }
          : isViewerRequest
            ? {
                borderColor: "var(--viewer-highlight-border)",
                backgroundColor: "var(--viewer-highlight-bg)",
              }
            : undefined
      }
    >
      {dropEdge ? (
        <div
          className={`pointer-events-none absolute inset-x-0 h-px bg-(--brand-deep) ${
            dropEdge === "top" ? "top-0" : "bottom-0"
          }`}
        />
      ) : null}

      <motion.div layout="position" className="flex items-stretch">
        {props.canManagePlaylist ? (
          <button
            ref={dragHandleRef}
            type="button"
            aria-label={t("queue.reorderAria", {
              song: formatSongLabel(props.item, t),
            })}
            className={`inline-flex w-7 shrink-0 items-center justify-center border-r border-(--border) text-(--muted) transition ${
              canReorder
                ? "cursor-grab hover:bg-(--panel-soft) hover:text-(--text) active:cursor-grabbing"
                : "cursor-not-allowed opacity-40"
            }`}
            disabled={!canReorder}
            title={
              canReorder ? t("queue.dragToReorder") : t("queue.currentStays")
            }
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <Collapsible
            open={canOpenActionTray && isActionTrayOpen}
            onOpenChange={(open) => {
              if (!canOpenActionTray) {
                return;
              }

              props.onExpandedActionItemChange(open ? props.itemId : null);
            }}
          >
            <motion.div
              layout="position"
              transition={{
                layout: {
                  duration: 0.24,
                  ease: [0.2, 0, 0, 1],
                },
              }}
              className="flex items-start gap-2 pl-3 pr-1 py-2"
            >
              {playlistPosition != null || isCurrent || isVipRequest ? (
                <div className="flex shrink-0 items-start gap-1 pt-0.5">
                  {playlistPosition != null ? (
                    <PanelPlaylistPositionBadge position={playlistPosition} />
                  ) : null}
                  {isCurrent ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-(--brand) bg-(--brand-soft) text-(--brand-deep)">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 2.4,
                          ease: "linear",
                          repeat: Number.POSITIVE_INFINITY,
                        }}
                        className="inline-flex"
                      >
                        <Disc3 className="h-3.5 w-3.5" />
                      </motion.span>
                    </span>
                  ) : null}
                  {!isCurrent && isVipRequest ? (
                    <span className="inline-flex h-5 items-center justify-center rounded-full bg-fuchsia-100 px-1.5 text-[9px] leading-none font-semibold tracking-[0.12em] text-fuchsia-700 uppercase">
                      {t("buttons.vip")}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="min-w-0 flex-1 pr-2">
                <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                  {formatSongLabel(props.item, t)}
                </p>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                  {formatRequesterLine(props.item, t)}
                </p>
                {pickNumber != null ||
                getPanelRequestedPathLabel(props.item) ||
                (isVipRequest && getPanelStoredVipTokenCost(props.item) > 1) ||
                (!isVipRequest &&
                  getPanelStoredVipTokenCost(props.item) > 0) ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {pickNumber != null ? (
                      <PickOrderBadge pickNumber={pickNumber} variant="panel" />
                    ) : null}
                    {getPanelRequestedPathLabel(props.item) ? (
                      <span className="inline-flex h-5 items-center border border-(--border-strong) bg-(--panel-soft) px-1.5 text-[9px] leading-none font-semibold tracking-[0.12em] text-(--text) uppercase">
                        {getPanelRequestedPathLabel(props.item)}
                      </span>
                    ) : null}
                    {(isVipRequest &&
                      getPanelStoredVipTokenCost(props.item) > 1) ||
                    (!isVipRequest &&
                      getPanelStoredVipTokenCost(props.item) > 0) ? (
                      <span className="inline-flex h-5 items-center border border-(--border-strong) bg-(--panel-soft) px-1.5 text-[9px] leading-none font-semibold text-(--text)">
                        {t("vip.balance", {
                          count: getPanelStoredVipTokenCost(props.item),
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="ml-auto flex shrink-0 self-center items-center gap-1">
                {canOpenActionTray ? (
                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                      title={t("panel.requestActions")}
                      aria-label={t("panel.requestActions")}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </CollapsibleTrigger>
                ) : null}
              </div>
            </motion.div>

            <AnimatePresence initial={false}>
              {canOpenActionTray && isActionTrayOpen ? (
                <CollapsibleContent forceMount asChild>
                  <motion.div
                    key="manage-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: {
                        duration: 0.22,
                        ease: [0.2, 0, 0, 1],
                      },
                      opacity: {
                        duration: 0.16,
                        ease: [0.2, 0, 0, 1],
                      },
                    }}
                    className="overflow-hidden border-t border-(--border) bg-(--panel-soft)"
                  >
                    <motion.div
                      layout="position"
                      transition={{
                        layout: {
                          duration: 0.22,
                          ease: [0.2, 0, 0, 1],
                        },
                      }}
                      className="flex flex-wrap items-center gap-1.5 px-3 py-2"
                    >
                      {canEditOwnRequest ? (
                        <PanelActionIconButton
                          label={t("queue.editRequest")}
                          className="text-(--brand-deep) hover:bg-(--brand-soft) hover:text-(--brand-deep)"
                          onClick={() => props.onEditRequest(props.itemId)}
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </PanelActionIconButton>
                      ) : null}

                      {canToggleVipRequest ? (
                        <PanelActionIconButton
                          label={
                            isVipRequest
                              ? t("queue.makeRegular")
                              : t("queue.makeVip")
                          }
                          className="text-fuchsia-700 hover:bg-fuchsia-100 hover:text-fuchsia-700"
                          onClick={() => {
                            void props.onPlaylistMutation({
                              action: "changeRequestKind",
                              itemId: props.itemId,
                              requestKind: nextRequestKind,
                            });
                          }}
                          disabled={
                            props.pendingAction === changeRequestKindActionKey
                          }
                        >
                          {props.pendingAction ===
                          changeRequestKindActionKey ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                        </PanelActionIconButton>
                      ) : null}

                      {canShowSetCurrent ? (
                        <PanelActionIconButton
                          label={t("queue.playNow")}
                          onClick={() => {
                            void props.onPlaylistMutation({
                              action: "setCurrent",
                              itemId: props.itemId,
                            });
                          }}
                          disabled={isSetCurrentDisabled}
                        >
                          {props.pendingAction === setCurrentActionKey ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </PanelActionIconButton>
                      ) : null}

                      {canReturnToQueue ? (
                        <PanelActionIconButton
                          label={t("queue.returnToQueue")}
                          onClick={() => {
                            void props.onPlaylistMutation({
                              action: "returnToQueue",
                              itemId: props.itemId,
                            });
                          }}
                          disabled={
                            props.pendingAction === returnToQueueActionKey
                          }
                        >
                          {props.pendingAction === returnToQueueActionKey ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5" />
                          )}
                        </PanelActionIconButton>
                      ) : null}

                      {canMarkPlayed ? (
                        <PanelActionIconButton
                          label={t("queue.markComplete")}
                          onClick={() => {
                            void props.onPlaylistMutation({
                              action: "markPlayed",
                              itemId: props.itemId,
                            });
                          }}
                          disabled={props.pendingAction === markPlayedActionKey}
                        >
                          {props.pendingAction === markPlayedActionKey ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CircleCheckBig className="h-3.5 w-3.5" />
                          )}
                        </PanelActionIconButton>
                      ) : null}

                      {canDeleteItem ? (
                        confirmingRemove ? (
                          <div
                            className="flex items-center gap-1 text-[10px] text-(--muted)"
                            ref={props.removeConfirmRef}
                          >
                            <span>
                              {props.canManagePlaylist
                                ? t("requests.removeFromPlaylistConfirm")
                                : t("requests.removeConfirm")}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--danger) shadow-none hover:bg-(--danger)/10 hover:text-(--danger)"
                              onClick={() => {
                                if (props.canManagePlaylist) {
                                  void props.onPlaylistMutation({
                                    action: "deleteItem",
                                    itemId: props.itemId,
                                  });
                                  return;
                                }

                                void props.onRemoveRequest(props.itemId);
                              }}
                              disabled={
                                props.pendingAction ===
                                (props.canManagePlaylist
                                  ? deleteActionKey
                                  : removeActionKey)
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                              onClick={() => props.onConfirmRemoveChange(null)}
                              disabled={
                                props.pendingAction ===
                                (props.canManagePlaylist
                                  ? deleteActionKey
                                  : removeActionKey)
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <PanelActionIconButton
                            label={
                              props.canManagePlaylist
                                ? t("queue.removeFromPlaylist")
                                : t("queue.removeRequest")
                            }
                            className="text-(--danger) hover:bg-(--danger)/10 hover:text-(--danger)"
                            onClick={() =>
                              props.onConfirmRemoveChange(props.itemId)
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </PanelActionIconButton>
                        )
                      ) : null}
                    </motion.div>
                  </motion.div>
                </CollapsibleContent>
              ) : null}
            </AnimatePresence>
          </Collapsible>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PanelSearchEditBanner(props: {
  item: PanelPlaylistItem;
  onCancel: () => void;
}) {
  const { t } = useLocaleTranslation("extension");

  return (
    <div className="mb-2 border border-(--brand) bg-(--brand-soft) px-2 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--brand-deep)">
            {t("requests.editBannerLabel")}
          </p>
          <p className="mt-1 truncate text-[12px] font-medium text-(--text)">
            {formatSongLabel(props.item, t)}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-(--muted)">
            {t("requests.editBannerDescription")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
          onClick={props.onCancel}
        >
          {t("buttons.cancel")}
        </Button>
      </div>
    </div>
  );
}

function PanelSearchVipButton(props: {
  disabled: boolean;
  disabledReason?: string | null;
  pending: boolean;
  isEditingRequest: boolean;
  onClick: () => void;
}) {
  const { t } = useLocaleTranslation("extension");

  const button = (
    <Button
      size="sm"
      className="h-6 px-2 text-[10px] leading-none shadow-none"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.pending
        ? props.isEditingRequest
          ? t("buttons.editing")
          : t("buttons.adding")
        : props.isEditingRequest
          ? t("buttons.editVip")
          : t("buttons.vip")}
    </Button>
  );

  if (!props.disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{props.disabledReason}</TooltipContent>
    </Tooltip>
  );
}

type PanelSpecialRequestSubmitInput =
  | {
      requestMode: "random" | "choice";
      requestKind: "regular" | "vip";
      query: string;
    }
  | {
      requestMode: "favorite";
      requestKind: "regular" | "vip";
    };

function PanelSpecialRequestControls(props: {
  randomQuery: string;
  onRandomQueryChange: (value: string) => void;
  choiceQuery: string;
  onChoiceQueryChange: (value: string) => void;
  canRequest: boolean;
  canVipRequest: boolean;
  vipDisabledReason?: string | null;
  pendingAction: string | null;
  isEditingRequest: boolean;
  onSubmit: (input: PanelSpecialRequestSubmitInput) => void;
}) {
  const { t } = useLocaleTranslation(["extension", "search"]);
  const [open, setOpen] = useState(false);
  const normalizedRandomQuery = props.randomQuery.trim();
  const normalizedChoiceQuery = props.choiceQuery.trim();
  const busy = props.pendingAction != null;
  const randomDisabledReason = getPanelSpecialRequestDisabledReason({
    query: normalizedRandomQuery,
    requestMode: "random",
    canRequest: props.canRequest,
    t,
  });
  const randomVipDisabledReason = getPanelSpecialRequestDisabledReason({
    query: normalizedRandomQuery,
    requestMode: "random",
    canRequest: props.canVipRequest,
    fallbackReason: props.vipDisabledReason ?? t("vip.insufficient"),
    t,
  });
  const choiceDisabledReason = getPanelSpecialRequestDisabledReason({
    query: normalizedChoiceQuery,
    requestMode: "choice",
    canRequest: props.canRequest,
    t,
  });
  const choiceVipDisabledReason = getPanelSpecialRequestDisabledReason({
    query: normalizedChoiceQuery,
    requestMode: "choice",
    canRequest: props.canVipRequest,
    fallbackReason: props.vipDisabledReason ?? t("vip.insufficient"),
    t,
  });
  const favoriteDisabledReason = getPanelSpecialRequestDisabledReason({
    query: "",
    requestMode: "favorite",
    canRequest: props.canRequest,
    t,
  });
  const favoriteVipDisabledReason = getPanelSpecialRequestDisabledReason({
    query: "",
    requestMode: "favorite",
    canRequest: props.canVipRequest,
    fallbackReason: props.vipDisabledReason ?? t("vip.insufficient"),
    t,
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mt-1.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
              <Sparkles className="h-3 w-3 text-(--brand-deep)" />
              <span>{t("requests.quick", { ns: "extension" })}</span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-(--muted) transition-transform",
                open ? "rotate-180" : ""
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden">
          <div className="grid gap-2 pt-2">
            <PanelSpecialRequestInputRow
              label={t("requests.randomSong", { ns: "extension" })}
              value={props.randomQuery}
              onValueChange={props.onRandomQueryChange}
              placeholder={t("controls.artist", { ns: "search" })}
              disabled={busy}
              regularDisabledReason={randomDisabledReason}
              vipDisabledReason={randomVipDisabledReason}
              busy={busy}
              regularPending={
                props.pendingAction ===
                getPanelViewerRequestActionKey({
                  query: normalizedRandomQuery,
                  requestMode: "random",
                  requestKind: "regular",
                })
              }
              vipPending={
                props.pendingAction ===
                getPanelViewerRequestActionKey({
                  query: normalizedRandomQuery,
                  requestMode: "random",
                  requestKind: "vip",
                })
              }
              isEditingRequest={props.isEditingRequest}
              onRegularClick={() =>
                props.onSubmit({
                  query: props.randomQuery,
                  requestMode: "random",
                  requestKind: "regular",
                })
              }
              onVipClick={() =>
                props.onSubmit({
                  query: props.randomQuery,
                  requestMode: "random",
                  requestKind: "vip",
                })
              }
            />
            <PanelSpecialRequestRow
              label={t("requests.randomFavorite", { ns: "extension" })}
              regularDisabledReason={favoriteDisabledReason}
              vipDisabledReason={favoriteVipDisabledReason}
              busy={busy}
              regularPending={
                props.pendingAction ===
                getPanelViewerRequestActionKey({
                  requestMode: "favorite",
                  requestKind: "regular",
                })
              }
              vipPending={
                props.pendingAction ===
                getPanelViewerRequestActionKey({
                  requestMode: "favorite",
                  requestKind: "vip",
                })
              }
              isEditingRequest={props.isEditingRequest}
              onRegularClick={() =>
                props.onSubmit({
                  requestMode: "favorite",
                  requestKind: "regular",
                })
              }
              onVipClick={() =>
                props.onSubmit({
                  requestMode: "favorite",
                  requestKind: "vip",
                })
              }
            />
            <PanelSpecialRequestInputRow
              label={t("requests.streamerChoice", { ns: "extension" })}
              value={props.choiceQuery}
              onValueChange={props.onChoiceQueryChange}
              placeholder={t("search.placeholder", { ns: "extension" })}
              disabled={busy}
              regularDisabledReason={choiceDisabledReason}
              vipDisabledReason={choiceVipDisabledReason}
              busy={busy}
              regularPending={
                props.pendingAction ===
                getPanelViewerRequestActionKey({
                  query: normalizedChoiceQuery,
                  requestMode: "choice",
                  requestKind: "regular",
                })
              }
              vipPending={
                props.pendingAction ===
                getPanelViewerRequestActionKey({
                  query: normalizedChoiceQuery,
                  requestMode: "choice",
                  requestKind: "vip",
                })
              }
              isEditingRequest={props.isEditingRequest}
              onRegularClick={() =>
                props.onSubmit({
                  query: props.choiceQuery,
                  requestMode: "choice",
                  requestKind: "regular",
                })
              }
              onVipClick={() =>
                props.onSubmit({
                  query: props.choiceQuery,
                  requestMode: "choice",
                  requestKind: "vip",
                })
              }
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function PanelSpecialRequestInputRow(props: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  regularDisabledReason: string | null;
  vipDisabledReason: string | null;
  busy: boolean;
  regularPending: boolean;
  vipPending: boolean;
  isEditingRequest: boolean;
  onRegularClick: () => void;
  onVipClick: () => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
          {props.label}
        </p>
        <PanelSpecialRequestActionButtons
          regularDisabledReason={props.regularDisabledReason}
          vipDisabledReason={props.vipDisabledReason}
          busy={props.busy}
          regularPending={props.regularPending}
          vipPending={props.vipPending}
          isEditingRequest={props.isEditingRequest}
          onRegularClick={props.onRegularClick}
          onVipClick={props.onVipClick}
        />
      </div>
      <Input
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        placeholder={props.placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        disabled={props.disabled}
        className="h-7 border-(--border-strong) bg-(--panel) px-2 py-1 text-[11px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
      />
    </div>
  );
}

function PanelSpecialRequestRow(props: {
  label: string;
  regularDisabledReason: string | null;
  vipDisabledReason: string | null;
  busy: boolean;
  regularPending: boolean;
  vipPending: boolean;
  isEditingRequest: boolean;
  onRegularClick: () => void;
  onVipClick: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
        {props.label}
      </p>
      <PanelSpecialRequestActionButtons
        regularDisabledReason={props.regularDisabledReason}
        vipDisabledReason={props.vipDisabledReason}
        busy={props.busy}
        regularPending={props.regularPending}
        vipPending={props.vipPending}
        isEditingRequest={props.isEditingRequest}
        onRegularClick={props.onRegularClick}
        onVipClick={props.onVipClick}
      />
    </div>
  );
}

function PanelSpecialRequestActionButtons(props: {
  regularDisabledReason: string | null;
  vipDisabledReason: string | null;
  busy: boolean;
  regularPending: boolean;
  vipPending: boolean;
  isEditingRequest: boolean;
  onRegularClick: () => void;
  onVipClick: () => void;
}) {
  const { t } = useLocaleTranslation("extension");
  const regularDisabled = props.busy || props.regularDisabledReason != null;
  const vipDisabled = props.busy || props.vipDisabledReason != null;

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[10px] leading-none shadow-none"
        disabled={regularDisabled}
        onClick={props.onRegularClick}
        title={props.regularDisabledReason ?? undefined}
      >
        {props.regularPending
          ? props.isEditingRequest
            ? t("buttons.editing")
            : t("buttons.adding")
          : props.isEditingRequest
            ? t("buttons.edit")
            : t("buttons.add")}
      </Button>
      <PanelSearchVipButton
        disabled={vipDisabled}
        disabledReason={props.vipDisabledReason}
        pending={props.vipPending}
        isEditingRequest={props.isEditingRequest}
        onClick={props.onVipClick}
      />
    </div>
  );
}

function PanelPlaylistFooterLink(props: { href: string; label: string }) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-center border-t border-(--border-strong) bg-(--brand-soft) px-3 pb-1 text-center">
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        className="block text-[10px] leading-3.5 font-medium text-(--brand-deep) underline decoration-(--brand-deep)/35 underline-offset-2 transition-colors hover:text-(--text)"
      >
        {props.label}
      </a>
    </div>
  );
}

function PanelPlaylistPositionBadge(props: { position: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-(--border-strong) bg-(--panel-soft) px-1.5 text-[10px] font-semibold text-(--text)">
      {props.position}
    </span>
  );
}

function PanelActionIconButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={props.label}
            className={`h-7 w-7 rounded-none px-0 shadow-none ${props.className ?? ""}`}
            onClick={props.onClick}
            disabled={props.disabled}
          >
            {props.children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

function PanelNotice(props: {
  children: ReactNode;
  icon: ReactNode;
  tone?: "default" | "danger" | "success";
  showProgress?: boolean;
  progressDurationMs?: number;
}) {
  const toneClassName =
    props.tone === "danger"
      ? "border-(--danger)/40 bg-(--danger)/10 text-(--danger)"
      : props.tone === "success"
        ? "border-(--success)/40 bg-(--success)/10 text-(--success)"
        : "border-(--border) bg-(--panel) text-(--brand-deep)";

  return (
    <div
      className={`relative overflow-hidden border-b px-3 py-2 text-[11px] leading-4 ${toneClassName}`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{props.icon}</div>
        <p className="min-w-0">{props.children}</p>
      </div>
      {props.showProgress ? (
        <motion.div
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-current/60"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{
            duration: (props.progressDurationMs ?? 3000) / 1000,
            ease: "linear",
          }}
        />
      ) : null}
    </div>
  );
}

function TransientNoticeBanner(props: {
  children: ReactNode;
  tone: "danger" | "success";
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{
        duration: 0.22,
        ease: [0.2, 0, 0, 1],
      }}
      className="overflow-hidden"
    >
      <PanelNotice
        icon={
          props.tone === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            <CircleAlert className="h-4 w-4" />
          )
        }
        tone={props.tone}
        showProgress
        progressDurationMs={3000}
      >
        {props.children}
      </PanelNotice>
    </motion.div>
  );
}

function PanelHeaderSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-40 rounded-none bg-(--panel-soft)" />
          <Skeleton className="mt-1.5 h-3 w-48 rounded-none bg-(--panel-soft)" />
        </div>
        <Skeleton className="mt-0.5 h-8 w-8 rounded-full bg-(--panel-soft)" />
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <Skeleton className="h-7 w-28 rounded-none bg-(--panel-soft)" />
      </div>
    </>
  );
}

function PanelLoadingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-(--border-strong)">
      <div className="grid h-auto w-full grid-cols-2 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0">
        <div className="border-r border-(--border-strong) px-3 py-2">
          <Skeleton className="h-3.5 w-20 rounded-none bg-(--panel-soft)" />
        </div>
        <div className="px-3 py-2">
          <Skeleton className="h-3.5 w-14 rounded-none bg-(--panel-soft)" />
        </div>
      </div>
      <div className="flex-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`panel-loading-row-${index}`}
            className="border-t border-(--border) px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-full rounded-none bg-(--panel-soft)" />
                <Skeleton className="mt-1.5 h-3 w-3/4 rounded-none bg-(--panel-soft)" />
              </div>
              <Skeleton className="h-3 w-12 rounded-none bg-(--panel-soft)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

class ExtensionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ExtensionRequestError";
  }
}

async function fetchExtensionJson<T>(
  token: string,
  pathname: string,
  apiBaseUrl?: string,
  init?: RequestInit
) {
  const response = await fetch(toExtensionApiUrl(pathname, apiBaseUrl), {
    ...init,
    headers: {
      "x-extension-jwt": token,
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new ExtensionRequestError(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "Extension request failed.",
      response.status
    );
  }

  return payload as T;
}

function isRetriableExtensionError(error: unknown) {
  return !(error instanceof ExtensionRequestError) || error.status >= 500;
}

function getRetryDelayMs(attempt: number, baseMs: number, maxMs: number) {
  return Math.min(baseMs * 2 ** attempt, maxMs);
}

function formatRetryDelay(delayMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(delayMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.ceil(totalSeconds / 60);
  return `${minutes}m`;
}

function getErrorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function translateExtensionMessage(message: string, t: TFunction) {
  const normalized = message.trim();
  const initialRetryMatch =
    /^Panel is still connecting\. Retrying in (.+)\.$/u.exec(normalized);
  if (initialRetryMatch) {
    return t("notices.connectingRetry", {
      delay: initialRetryMatch[1],
    });
  }

  const reconnectRetryMatch =
    /^Connection interrupted\. Retrying in (.+)\.$/u.exec(normalized);
  if (reconnectRetryMatch) {
    return t("notices.connectionInterruptedRetry", {
      delay: reconnectRetryMatch[1],
    });
  }

  switch (normalized) {
    case "Unable to load the Twitch extension helper.":
      return t("notices.helperLoadFailed");
    case "The Twitch extension helper is unavailable.":
      return t("notices.helperUnavailable");
    case "Unable to load panel state.":
      return t("notices.panelStateLoadFailed");
    case "Unable to refresh panel state.":
      return t("notices.panelStateRefreshFailed");
    case "Unable to update request.":
      return t("notices.updateRequestFailed");
    case "Unable to remove request.":
      return t("notices.removeRequestFailed");
    case "Unable to update the playlist.":
      return t("notices.updatePlaylistFailed");
    case "Unable to search songs.":
      return t("search.searchFailed");
    case "Extension request failed.":
      return t("notices.extensionRequestFailed");
    case "Request updated.":
      return t("requests.updated");
    case "Request added.":
      return t("requests.added");
    case "Request removed.":
      return t("requests.removed");
    case "Request changed to VIP.":
      return t("requests.changedVip");
    case "Request changed to regular.":
      return t("requests.changedRegular");
    case "Song is now playing.":
      return t("queue.setCurrentSuccess");
    case "Song returned to queue.":
      return t("queue.returnToQueueSuccess");
    case "Song marked played.":
      return t("queue.markPlayedSuccess");
    case "Playlist item removed.":
      return t("queue.deleteItemSuccess");
    case "Playlist shuffled.":
      return t("queue.shuffleSuccess");
    case "Playlist order updated.":
      return t("queue.reorderSuccess");
    case "Playlist updated.":
      return t("queue.updated");
    case "You can add requests when the stream goes live.":
      return t("requests.addWhenLive");
    case "Not enough VIP tokens.":
      return t("vip.notEnough");
    case "You do not have enough VIP tokens.":
      return t("vip.insufficient");
    case "Viewer state is still loading.":
      return t("panel.viewerStateLoading");
    case "Share Twitch identity to request.":
      return t("panel.shareIdentityToRequest");
    case "This Twitch channel has not connected RockList.Live yet.":
      return t("access.channelNotConnected");
    case "Viewer profile could not be resolved right now.":
      return t("access.viewerProfileUnavailable");
    case "Share Twitch identity to request songs.":
      return t("access.shareIdentityToRequestSongs");
    case "Share Twitch identity to manage requests from the panel.":
      return t("access.shareIdentityToManage");
    case "You are blocked from requesting songs in this channel.":
      return t("access.blocked");
    case "That song is unavailable right now.":
      return t("search.unavailable");
    case "Type an artist or song first.":
      return t("search.typeArtistOrSong");
    case "No songs matched that search.":
      return t("search.noResults");
    case "Requests are off right now.":
      return t("requests.offRightNow");
    case "Please wait before performing another search.":
      return t("search.rateLimited");
    default:
      return normalized;
  }
}

function orderPanelPlaylistItems(
  items: PanelPlaylistItem[],
  orderedItemIds: string[]
) {
  const itemLookup = new Map(
    items.map((item) => [getString(item, "id"), item] as const)
  );
  const orderedItems = orderedItemIds
    .map((itemId) => itemLookup.get(itemId))
    .filter((item): item is PanelPlaylistItem => Boolean(item));
  const missingItems = items.filter((item) => {
    const itemId = getString(item, "id");
    return !itemId || !orderedItemIds.includes(itemId);
  });

  return [...orderedItems, ...missingItems].map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

function getReorderedPanelItemIds(
  items: PanelPlaylistItem[],
  currentItemId: string | null,
  sourceItemId: string,
  targetItemId: string,
  edge: Edge
) {
  const reorderableItemIds = items
    .map((item) => getString(item, "id"))
    .filter(
      (itemId): itemId is string => Boolean(itemId) && itemId !== currentItemId
    );
  const startIndex = reorderableItemIds.indexOf(sourceItemId);
  const indexOfTarget = reorderableItemIds.indexOf(targetItemId);

  if (startIndex === -1 || indexOfTarget === -1) {
    return null;
  }

  const finishIndex = getReorderDestinationIndex({
    startIndex,
    indexOfTarget,
    closestEdgeOfTarget: edge,
    axis: "vertical",
  });

  if (finishIndex === startIndex) {
    return null;
  }

  return reorder({
    list: reorderableItemIds,
    startIndex,
    finishIndex,
  });
}

function getPanelPlaylistDragData(args: {
  itemId: string;
  element: HTMLElement;
  input: Parameters<typeof attachClosestEdge>[1]["input"];
}) {
  return attachClosestEdge(
    {
      type: "panel-playlist-item",
      itemId: args.itemId,
    },
    {
      element: args.element,
      input: args.input,
      allowedEdges: ["top", "bottom"],
    }
  );
}

function getPlaylistMutationSuccessMessage(
  mutation: PanelPlaylistMutation,
  response: PanelPlaylistMutationResponse,
  t: TFunction
) {
  if (typeof response?.error === "string" && response.error.trim()) {
    return response.error;
  }

  if (typeof response?.message === "string" && response.message.trim()) {
    return response.message;
  }

  switch (mutation.action) {
    case "setCurrent":
      return t("queue.setCurrentSuccess");
    case "returnToQueue":
      return t("queue.returnToQueueSuccess");
    case "markPlayed":
      return t("queue.markPlayedSuccess");
    case "deleteItem":
      return t("queue.deleteItemSuccess");
    case "changeRequestKind":
      return mutation.requestKind === "vip"
        ? t("requests.changedVip")
        : t("requests.changedRegular");
    case "shufflePlaylist":
      return t("queue.shuffleSuccess");
    case "reorderItems":
      return t("queue.reorderSuccess");
    default:
      return t("queue.updated");
  }
}

function getString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isViewerOwnedActivePanelItem(
  item: PanelPlaylistItem,
  viewerProfile: PanelBootstrapResponse["viewer"]["profile"]
) {
  const status = getString(item, "status");
  return (
    viewerProfile != null &&
    getString(item, "requestedByTwitchUserId") === viewerProfile.twitchUserId &&
    (status === "queued" || status === "current")
  );
}

function getViewerEditablePanelItem(
  items: PanelPlaylistItem[],
  viewerProfile: PanelBootstrapResponse["viewer"]["profile"],
  itemId: string | null
) {
  if (!itemId) {
    return null;
  }

  const item =
    items.find((candidate) => getString(candidate, "id") === itemId) ?? null;

  return item && isViewerOwnedActivePanelItem(item, viewerProfile)
    ? getString(item, "status") === "queued"
      ? item
      : null
    : null;
}

function getNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0
      )
    : null;
}

function getPanelSearchPathTone(path: PanelSearchPath) {
  switch (path) {
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

function getPanelSearchPathTextTone(path: PanelSearchPath) {
  switch (path) {
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

type PanelSearchMultiSelectOption = {
  value: string;
  label: string;
  keywords?: string[];
};

type PanelSearchSummaryItem = {
  key: string;
  label: string;
  className?: string;
};

function truncatePanelFilterSummaryText(value: string, maxLength = 18) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function getPanelSearchSummaryItems(
  filters: PanelSearchFilters,
  t: TFunction
): PanelSearchSummaryItem[] {
  const summaryItems: PanelSearchSummaryItem[] = [];

  for (const path of filters.parts) {
    summaryItems.push({
      key: `path:${path}`,
      label: formatPathLabel(path),
      className: cn(
        "font-semibold uppercase tracking-[0.12em]",
        getPanelSearchPathTextTone(path)
      ),
    });
  }

  if (filters.parts.length > 1) {
    summaryItems.push({
      key: "parts-match-mode",
      label:
        filters.partsMatchMode === "all"
          ? t("search.matchAll", { ns: "extension" })
          : t("search.matchAny", { ns: "extension" }),
      className: "font-semibold uppercase tracking-[0.12em] text-(--muted)",
    });
  }

  if (filters.favoritesOnly) {
    summaryItems.push({
      key: "favorites",
      label: t("search.favoritesOnly", { ns: "extension" }),
      className: "font-semibold text-rose-300",
    });
  }

  if (filters.title.trim()) {
    summaryItems.push({
      key: "title",
      label: `${t("controls.title", { ns: "search" })}: ${truncatePanelFilterSummaryText(filters.title)}`,
    });
  }

  if (filters.artist.trim()) {
    summaryItems.push({
      key: "artist",
      label: `${t("controls.artist", { ns: "search" })}: ${truncatePanelFilterSummaryText(filters.artist)}`,
    });
  }

  if (filters.album.trim()) {
    summaryItems.push({
      key: "album",
      label: `${t("controls.album", { ns: "search" })}: ${truncatePanelFilterSummaryText(filters.album)}`,
    });
  }

  if (filters.creator.trim()) {
    summaryItems.push({
      key: "creator",
      label: `${t("controls.creator", { ns: "search" })}: ${truncatePanelFilterSummaryText(filters.creator)}`,
    });
  }

  if (filters.tuning.length > 0) {
    summaryItems.push({
      key: "tuning",
      label: `${t("controls.tuning", { ns: "search" })}: ${filters.tuning.length}`,
    });
  }

  if (filters.year.length > 0) {
    summaryItems.push({
      key: "year",
      label: `${t("controls.year", { ns: "search" })}: ${filters.year.length}`,
    });
  }

  return summaryItems;
}

function PanelSearchFiltersBar(props: {
  filters: PanelSearchFilters;
  onChange: (
    updater: (current: PanelSearchFilters) => PanelSearchFilters
  ) => void;
  onReset: () => void;
  showReset: boolean;
}) {
  const { t } = useLocaleTranslation(["extension", "search"]);
  const [open, setOpen] = useState(false);
  const filterOptionsQuery = useQuery<SearchFilterOptionsResponse>({
    queryKey: ["search-filter-options-v3"],
    enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/search/filters", { signal });
      const body = (await response.json().catch(() => null)) as
        | SearchFilterOptionsWireResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(body && "message" in body ? body.message : "");
      }

      return normalizeSearchFilterOptionsResponse(
        body as SearchFilterOptionsWireResponse | null
      );
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
  const tuningOptions = useMemo(
    () =>
      (filterOptionsQuery.data?.tunings ?? []).map(
        (option: TuningOption) =>
          ({
            value: String(option.id),
            label: option.label,
          }) satisfies PanelSearchMultiSelectOption
      ),
    [filterOptionsQuery.data?.tunings]
  );
  const yearOptions = useMemo(
    () =>
      (filterOptionsQuery.data?.years ?? []).map(
        (year) =>
          ({
            value: String(year),
            label: String(year),
          }) satisfies PanelSearchMultiSelectOption
      ),
    [filterOptionsQuery.data?.years]
  );
  const summaryItems = useMemo(
    () => getPanelSearchSummaryItems(props.filters, t),
    [props.filters, t]
  );
  const filterOptionsPlaceholder =
    filterOptionsQuery.isPending && !filterOptionsQuery.data
      ? t("search.loadingFilters", { ns: "extension" })
      : undefined;
  const filtersDisabled =
    (filterOptionsQuery.isPending && !filterOptionsQuery.data) ||
    filterOptionsQuery.isError;

  function handleResetClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    props.onReset();
  }

  function updateTextFilter(
    key: "album" | "artist" | "creator" | "title",
    value: string
  ) {
    props.onChange((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function togglePath(path: PanelSearchPath) {
    props.onChange((current) => {
      const nextParts = current.parts.includes(path)
        ? current.parts.filter((value) => value !== path)
        : [...current.parts, path];

      return {
        ...current,
        parts: nextParts,
        partsMatchMode: nextParts.length > 1 ? current.partsMatchMode : "any",
      };
    });
  }

  function toggleTuning(tuningId: number) {
    props.onChange((current) => ({
      ...current,
      tuning: current.tuning.includes(tuningId)
        ? current.tuning.filter((value) => value !== tuningId)
        : [...current.tuning, tuningId],
    }));
  }

  function toggleYear(year: number) {
    props.onChange((current) => ({
      ...current,
      year: current.year.includes(year)
        ? current.year.filter((value) => value !== year)
        : [...current.year, year],
    }));
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mt-1.5">
        <div className="flex items-start gap-1.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start text-left"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>{t("search.filtersLabel", { ns: "extension" })}</span>
                </span>
                {summaryItems.map((item) => (
                  <span
                    key={item.key}
                    className={cn(
                      "text-[10px] leading-4 text-(--text)",
                      item.className
                    )}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center gap-0.5">
            {props.showReset ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-rose-300 transition hover:bg-rose-950/30 hover:text-rose-100"
                    onClick={handleResetClick}
                    aria-label={t("buttons.reset", { ns: "extension" })}
                    title={t("buttons.reset", { ns: "extension" })}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("buttons.reset", { ns: "extension" })}
                </TooltipContent>
              </Tooltip>
            ) : null}
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-(--muted) transition hover:text-(--text)"
                aria-label={t("search.filtersLabel", { ns: "extension" })}
                title={t("search.filtersLabel", { ns: "extension" })}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    open ? "rotate-180" : ""
                  )}
                />
              </button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent className="overflow-hidden">
          <div className="grid gap-2 pt-2">
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={props.filters.favoritesOnly ? "secondary" : "outline"}
                className={cn(
                  "h-6 px-2 text-[10px] shadow-none",
                  props.filters.favoritesOnly
                    ? "border-rose-700/50 bg-rose-950 text-rose-100 hover:bg-rose-900"
                    : "text-(--muted)"
                )}
                onClick={() =>
                  props.onChange((current) => ({
                    ...current,
                    favoritesOnly: !current.favoritesOnly,
                  }))
                }
              >
                <Heart
                  className={cn(
                    "h-3 w-3",
                    props.filters.favoritesOnly ? "fill-current" : ""
                  )}
                />
                <span>{t("search.favoritesOnly", { ns: "extension" })}</span>
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                {t("controls.path", { ns: "search" })}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {pathOptions.map((path) => {
                  const selected = props.filters.parts.includes(path);

                  return (
                    <button
                      key={path}
                      type="button"
                      className={cn(
                        "inline-flex h-6 items-center justify-center border px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                        selected
                          ? getPanelSearchPathTone(path)
                          : "border-(--border-strong) bg-(--panel) text-(--muted) hover:border-(--brand) hover:text-(--text)"
                      )}
                      onClick={() => togglePath(path)}
                    >
                      {formatPathLabel(path)}
                    </button>
                  );
                })}
              </div>
              {props.filters.parts.length > 1 ? (
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      props.filters.partsMatchMode === "any"
                        ? "secondary"
                        : "outline"
                    }
                    className="h-6 px-2 text-[10px] shadow-none"
                    onClick={() =>
                      props.onChange((current) => ({
                        ...current,
                        partsMatchMode: "any",
                      }))
                    }
                  >
                    {t("search.matchAny", { ns: "extension" })}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      props.filters.partsMatchMode === "all"
                        ? "secondary"
                        : "outline"
                    }
                    className="h-6 px-2 text-[10px] shadow-none"
                    onClick={() =>
                      props.onChange((current) => ({
                        ...current,
                        partsMatchMode: "all",
                      }))
                    }
                  >
                    {t("search.matchAll", { ns: "extension" })}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                  {t("controls.title", { ns: "search" })}
                </Label>
                <Input
                  value={props.filters.title}
                  onChange={(event) =>
                    updateTextFilter("title", event.target.value)
                  }
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="h-8 border-(--border-strong) bg-(--panel) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                  {t("controls.artist", { ns: "search" })}
                </Label>
                <Input
                  value={props.filters.artist}
                  onChange={(event) =>
                    updateTextFilter("artist", event.target.value)
                  }
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="h-8 border-(--border-strong) bg-(--panel) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                  {t("controls.album", { ns: "search" })}
                </Label>
                <Input
                  value={props.filters.album}
                  onChange={(event) =>
                    updateTextFilter("album", event.target.value)
                  }
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="h-8 border-(--border-strong) bg-(--panel) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                  {t("controls.creator", { ns: "search" })}
                </Label>
                <Input
                  value={props.filters.creator}
                  onChange={(event) =>
                    updateTextFilter("creator", event.target.value)
                  }
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="h-8 border-(--border-strong) bg-(--panel) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                  {t("controls.tuning", { ns: "search" })}
                </Label>
                <PanelSearchMultiSelect
                  label={t("controls.tuning", { ns: "search" })}
                  options={tuningOptions}
                  selectedValues={props.filters.tuning.map((value) =>
                    String(value)
                  )}
                  onAdd={(value) => toggleTuning(Number(value))}
                  onRemove={(value) => toggleTuning(Number(value))}
                  disabled={filtersDisabled}
                  placeholder={filterOptionsPlaceholder}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
                  {t("controls.year", { ns: "search" })}
                </Label>
                <PanelSearchMultiSelect
                  label={t("controls.year", { ns: "search" })}
                  options={yearOptions}
                  selectedValues={props.filters.year.map((value) =>
                    String(value)
                  )}
                  onAdd={(value) => toggleYear(Number(value))}
                  onRemove={(value) => toggleYear(Number(value))}
                  disabled={filtersDisabled}
                  placeholder={filterOptionsPlaceholder}
                />
              </div>
            </div>

            {filterOptionsQuery.isPending && !filterOptionsQuery.data ? (
              <p className="text-[10px] leading-4 text-(--muted)">
                {t("search.loadingFilters", { ns: "extension" })}
              </p>
            ) : null}
            {filterOptionsQuery.isError ? (
              <p className="text-[10px] leading-4 text-(--danger)">
                {t("errors.filterOptionsFailed", { ns: "search" })}
              </p>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function PanelSearchMultiSelect(props: {
  label: string;
  options: readonly PanelSearchMultiSelectOption[];
  selectedValues: readonly string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t } = useLocaleTranslation("search");
  const [open, setOpen] = useState(false);
  const optionLabelByValue = useMemo(
    () => new Map(props.options.map((option) => [option.value, option.label])),
    [props.options]
  );
  const summary =
    props.selectedValues.length > 0
      ? t("multiSelect.selected", { count: props.selectedValues.length })
      : (props.placeholder ?? t("multiSelect.select", { label: props.label }));

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={props.disabled}
            className="flex h-8 w-full items-center justify-between rounded-[3px] border border-(--border-strong) bg-(--panel) px-2 py-1 text-left text-[11px] text-(--text) shadow-none transition-colors hover:border-(--brand) disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-(--muted) transition-transform",
                open ? "rotate-180" : ""
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) border-(--border) bg-(--panel-strong) p-0 text-(--text)"
        >
          <Command className="bg-(--panel-strong) text-(--text)">
            <CommandInput
              placeholder={t("multiSelect.filter", { label: props.label })}
            />
            <CommandList className="max-h-52">
              <CommandEmpty>{t("multiSelect.noMatches")}</CommandEmpty>
              <CommandGroup>
                {props.options.map((option) => {
                  const selected = props.selectedValues.includes(option.value);

                  return (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value}`}
                      keywords={option.keywords}
                      onSelect={() => {
                        if (selected) {
                          props.onRemove(option.value);
                        } else {
                          props.onAdd(option.value);
                        }
                      }}
                      className="cursor-pointer gap-2 bg-transparent text-(--text) transition-colors hover:bg-(--panel) data-[selected=true]:bg-(--panel) data-[selected=true]:text-(--text)"
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                      />
                      <span className="text-xs">{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {props.selectedValues.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {props.selectedValues.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => props.onRemove(value)}
              className="inline-flex items-center gap-0.5 text-[10px] leading-4 text-(--text) transition hover:text-(--brand)"
            >
              <span>{optionLabelByValue.get(value) ?? value}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getPanelStoredVipTokenCost(item: Record<string, unknown>) {
  const vipTokenCost = getNumber(item, "vipTokenCost");
  if (vipTokenCost != null && vipTokenCost >= 0) {
    return Math.trunc(vipTokenCost);
  }

  return getString(item, "requestKind") === "vip" ? 1 : 0;
}

function getPanelRequestedPathLabel(item: Record<string, unknown>) {
  const requestedPath = getPrimaryRequestedPath({
    requestedQuery: getString(item, "requestedQuery"),
  });

  return requestedPath ? formatPathLabel(requestedPath) : null;
}

function PanelSearchSongActions(props: {
  item: Record<string, unknown>;
  canRequest: boolean;
  canVipRequest: boolean;
  requestUnavailableReason?: string | null;
  vipUnavailableReason?: string | null;
  viewerVipTokenCount: number;
  editingRequest: PanelPlaylistItem | null;
  pendingAction: string | null;
  allowRequestPathModifiers: boolean;
  allowedRequestPaths: string[];
  requestPathModifierVipTokenCost: number;
  requestPathModifierVipTokenCosts: {
    guitar: number;
    lead: number;
    rhythm: number;
    bass: number;
  };
  requestPathModifierUsesVipPriority: boolean;
  vipTokenDurationThresholds: VipTokenDurationThreshold[];
  onSubmit: (input: PanelViewerRequestSubmitInput) => void;
}) {
  const { t } = useLocaleTranslation("extension");
  const songId = getString(props.item, "id");
  const availableRequestedPaths = props.allowRequestPathModifiers
    ? getAvailableRequestedPaths(
        getStringArray(props.item, "parts"),
        props.allowedRequestPaths
      )
    : [];
  const editingRequestedPath =
    getString(props.editingRequest ?? {}, "songId") === songId
      ? getPrimaryRequestedPath({
          requestedQuery: getString(
            props.editingRequest ?? {},
            "requestedQuery"
          ),
        })
      : null;
  const [requestedPath, setRequestedPath] = useState<RequestPathOption | "">(
    editingRequestedPath ?? ""
  );

  useEffect(() => {
    setRequestedPath(editingRequestedPath ?? "");
  }, [editingRequestedPath, songId]);

  useEffect(() => {
    if (
      requestedPath &&
      !availableRequestedPaths.includes(requestedPath as RequestPathOption)
    ) {
      setRequestedPath("");
    }
  }, [availableRequestedPaths, requestedPath]);

  const selectedRequestedPath = requestedPath || undefined;
  const selectedRequestedPaths = selectedRequestedPath
    ? [selectedRequestedPath]
    : [];
  const songDurationText = getString(props.item, "durationText");
  const editingVipTokenCost = props.editingRequest
    ? getPanelStoredVipTokenCost(props.editingRequest)
    : 0;
  const regularPlan = getRequestVipTokenPlan({
    requestKind: "regular",
    song: {
      durationText: songDurationText,
    },
    requestedPaths: selectedRequestedPaths,
    thresholds: props.vipTokenDurationThresholds,
    settings: {
      allowRequestPathModifiers: props.allowRequestPathModifiers,
      allowedRequestPathsJson: JSON.stringify(props.allowedRequestPaths),
      requestPathModifierVipTokenCost: props.requestPathModifierVipTokenCost,
      requestPathModifierVipTokenCosts: props.requestPathModifierVipTokenCosts,
      requestPathModifierUsesVipPriority:
        props.requestPathModifierUsesVipPriority,
    },
  });
  const vipPlan = getRequestVipTokenPlan({
    requestKind: "vip",
    song: {
      durationText: songDurationText,
    },
    requestedPaths: selectedRequestedPaths,
    thresholds: props.vipTokenDurationThresholds,
    settings: {
      allowRequestPathModifiers: props.allowRequestPathModifiers,
      allowedRequestPathsJson: JSON.stringify(props.allowedRequestPaths),
      requestPathModifierVipTokenCost: props.requestPathModifierVipTokenCost,
      requestPathModifierVipTokenCosts: props.requestPathModifierVipTokenCosts,
      requestPathModifierUsesVipPriority:
        props.requestPathModifierUsesVipPriority,
    },
  });
  const regularActionKey = songId
    ? getPanelViewerRequestActionKey({
        songId,
        requestKind: "regular",
        requestMode: "catalog",
        requestedPath: selectedRequestedPath,
      })
    : "unknown:regular";
  const vipActionKey = songId
    ? getPanelViewerRequestActionKey({
        songId,
        requestKind: "vip",
        requestMode: "catalog",
        requestedPath: selectedRequestedPath,
      })
    : "unknown:vip";
  const regularPending = props.pendingAction === regularActionKey;
  const vipPending = props.pendingAction === vipActionKey;
  const regularAdditionalCost = Math.max(
    0,
    regularPlan.totalVipTokenCost - editingVipTokenCost
  );
  const vipAdditionalCost = Math.max(
    0,
    vipPlan.totalVipTokenCost - editingVipTokenCost
  );
  const regularDisabledReason = !songId
    ? t("search.unavailable")
    : !props.canRequest
      ? (props.requestUnavailableReason ?? t("requests.noPermission"))
      : regularPlan.totalVipTokenCost > 0 &&
          props.viewerVipTokenCount < regularAdditionalCost
        ? t("vip.insufficient")
        : null;
  const vipDisabledReason = !songId
    ? t("search.unavailable")
    : !props.canVipRequest
      ? (props.vipUnavailableReason ??
        props.requestUnavailableReason ??
        t("requests.noPermission"))
      : props.viewerVipTokenCount < vipAdditionalCost
        ? t("vip.insufficient")
        : null;
  const helperText = regularDisabledReason || vipDisabledReason;
  const regularCostCaption = getPanelRequestCostCaption({
    requestKind: "regular",
    totalVipTokenCost: regularPlan.totalVipTokenCost,
    matchedDurationThreshold: regularPlan.matchedDurationThreshold,
    requestedPath: selectedRequestedPath,
    requestedPathVipTokenCost: regularPlan.requestedPathVipTokenCost,
    t,
  });
  const vipCostCaption = getPanelRequestCostCaption({
    requestKind: "vip",
    totalVipTokenCost: vipPlan.totalVipTokenCost || 1,
    matchedDurationThreshold: vipPlan.matchedDurationThreshold,
    requestedPath: selectedRequestedPath,
    requestedPathVipTokenCost: vipPlan.requestedPathVipTokenCost,
    t,
  });

  return (
    <div className="grid gap-2">
      {availableRequestedPaths.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)">
            {t("requests.choosePath")}
          </p>
          <Select
            value={selectedRequestedPath ?? "__none"}
            onValueChange={(value) =>
              setRequestedPath(
                value === "__none" ? "" : (value as RequestPathOption)
              )
            }
          >
            <SelectTrigger className="h-8 min-w-[9rem] px-2 text-[11px] shadow-none">
              <SelectValue placeholder={t("requests.noPathPreference")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">
                {t("requests.noPathPreference")}
              </SelectItem>
              {availableRequestedPaths.map((path) => (
                <SelectItem key={path} value={path}>
                  {formatPathLabel(path)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid shrink-0 grid-cols-2 gap-1">
        <div className="grid gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] leading-none shadow-none"
            disabled={!!regularDisabledReason || regularPending}
            title={regularDisabledReason ?? undefined}
            onClick={() => {
              if (!songId) {
                return;
              }

              props.onSubmit({
                songId,
                requestKind: "regular",
                requestedPath: selectedRequestedPath,
                vipTokenCost: regularPlan.totalVipTokenCost || undefined,
              });
            }}
          >
            {regularPending
              ? props.editingRequest
                ? t("buttons.editing")
                : t("buttons.adding")
              : props.editingRequest
                ? t("buttons.edit")
                : t("buttons.add")}
          </Button>
          <p className="min-h-4 text-center text-[10px] leading-4 text-(--muted)">
            {regularCostCaption}
          </p>
        </div>
        <div className="grid gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] leading-none shadow-none"
            disabled={!!vipDisabledReason || vipPending}
            title={vipDisabledReason ?? undefined}
            onClick={() => {
              if (!songId) {
                return;
              }

              props.onSubmit({
                songId,
                requestKind: "vip",
                requestedPath: selectedRequestedPath,
                vipTokenCost: vipPlan.totalVipTokenCost || 1,
              });
            }}
          >
            {vipPending
              ? props.editingRequest
                ? t("buttons.editing")
                : t("buttons.adding")
              : props.editingRequest
                ? t("buttons.editVip")
                : t("buttons.vip")}
          </Button>
          <p className="min-h-4 text-center text-[10px] leading-4 text-(--muted)">
            {vipCostCaption}
          </p>
        </div>
      </div>
      {helperText ? (
        <p className="text-[11px] leading-4 text-(--muted)">{helperText}</p>
      ) : null}
    </div>
  );
}

function formatSongLabel(item: Record<string, unknown>, t: TFunction) {
  const warningCode = getString(item, "warningCode");
  const requestedQuery = getString(item, "requestedQuery");
  if (warningCode === "streamer_choice") {
    return requestedQuery
      ? t("playlistItem.streamerChoiceWithQuery", {
          query: requestedQuery,
        })
      : t("playlistItem.streamerChoice");
  }

  const artist = getString(item, "songArtist");
  const title = getString(item, "songTitle") ?? t("playlistItem.unknownSong");
  return artist ? `${artist} - ${title}` : title;
}

function getPanelRequestCostCaption(input: {
  requestKind: "regular" | "vip";
  totalVipTokenCost: number;
  matchedDurationThreshold?: { minimumDurationMinutes: number } | null;
  requestedPath?: RequestPathOption;
  requestedPathVipTokenCost: number;
  t: TFunction;
}) {
  if (input.totalVipTokenCost <= 0) {
    return "";
  }

  const reasons: string[] = [];

  if (input.matchedDurationThreshold) {
    reasons.push(
      input.t("requests.durationShort", {
        minutes: formatVipDurationThresholdMinutes(
          input.matchedDurationThreshold.minimumDurationMinutes
        ),
      })
    );
  }

  if (input.requestedPath && input.requestedPathVipTokenCost > 0) {
    reasons.push(formatPathLabel(input.requestedPath));
  }

  if (reasons.length === 0) {
    if (input.requestKind === "vip" && input.totalVipTokenCost === 1) {
      return "";
    }

    return formatVipTokenCostLabel(input.totalVipTokenCost);
  }

  return input.t("requests.costSummary", {
    reasons: reasons.join(" + "),
    count: formatVipTokenCostLabel(input.totalVipTokenCost),
  });
}

function getPanelManagerVipTokenStatusLabel(input: {
  requiredVipTokenCost: number;
  availableVipTokenCount: number;
  t: TFunction;
}) {
  if (input.requiredVipTokenCost <= 0) {
    return "";
  }

  const count = formatVipTokenCount(input.availableVipTokenCount);

  return input.availableVipTokenCount < input.requiredVipTokenCost
    ? input.t("requests.insufficientWithBalance", {
        cost: formatVipTokenCostLabel(input.requiredVipTokenCost),
        count,
      })
    : input.t("requests.costWithBalance", {
        cost: formatVipTokenCostLabel(input.requiredVipTokenCost),
        count,
      });
}

function formatRequesterLine(item: Record<string, unknown>, t: TFunction) {
  const requester =
    getString(item, "requestedByDisplayName") ??
    getString(item, "requestedByLogin") ??
    t("playlistItem.unknownRequester");
  const addedAt = t("playlistItem.metaAdded", {
    time: formatCompactRelativeTimestamp(getNumber(item, "createdAt"), t),
  });
  const editedAt = formatEditedTimestamp(item, t);

  return editedAt
    ? t("playlistItem.metaLineEdited", {
        requester,
        added: addedAt,
        edited: editedAt,
      })
    : t("playlistItem.metaLine", {
        requester,
        added: addedAt,
      });
}

function formatEditedTimestamp(item: Record<string, unknown>, t: TFunction) {
  const updatedAt = getNumber(item, "editedAt");
  const createdAt = getNumber(item, "createdAt");

  if (updatedAt == null || createdAt == null || updatedAt <= createdAt) {
    return null;
  }

  return t("playlistItem.metaEdited", {
    time: formatCompactRelativeTimestamp(updatedAt, t),
  });
}

function formatCompactRelativeTimestamp(
  timestamp: number | null,
  t: TFunction
) {
  if (timestamp == null) {
    return t("playlistItem.recent");
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 10) {
    return t("playlistItem.now");
  }
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d`;
}

function formatSearchSongLabel(item: Record<string, unknown>, t: TFunction) {
  const artist = getString(item, "artist");
  const title = getString(item, "title") ?? t("playlistItem.unknownSong");
  return artist ? `${artist} - ${title}` : title;
}

function formatSearchSongMeta(item: Record<string, unknown>) {
  return [getString(item, "album"), getString(item, "tuning")]
    .filter(Boolean)
    .join(" · ");
}

function getPanelViewerRequestActionKey(input: PanelViewerRequestSubmitInput) {
  if ("songId" in input) {
    return `${input.songId}:${input.requestKind}:${input.requestedPath ?? "none"}`;
  }

  return "query" in input
    ? `special:${input.requestMode}:${input.requestKind}:${input.query.trim().toLowerCase()}`
    : `special:${input.requestMode}:${input.requestKind}`;
}

function getPanelSpecialRequestDisabledReason(input: {
  query: string;
  requestMode: "random" | "favorite" | "choice";
  canRequest: boolean;
  fallbackReason?: string;
  t: TFunction;
}) {
  if (input.requestMode !== "favorite" && input.query.length < 2) {
    return input.t("search.typeAtLeastTwo");
  }

  if (!input.canRequest) {
    return input.fallbackReason ?? input.t("requests.noPermission");
  }

  return null;
}

function PanelRequestsStatusBar({
  requestsEnabled,
}: {
  requestsEnabled: boolean;
}) {
  const { t } = useLocaleTranslation("extension");

  return (
    <div
      className={
        requestsEnabled
          ? "border-b border-(--border-strong) bg-emerald-950/80 px-3 py-[3px] text-center text-[9px] leading-[1em] font-semibold uppercase tracking-[0.16em] text-emerald-100"
          : "border-b border-(--border-strong) bg-rose-950/60 px-3 py-[3px] text-center text-[9px] leading-[1em] font-semibold uppercase tracking-[0.16em] text-rose-100"
      }
    >
      {t("requests.status", {
        state: requestsEnabled
          ? t("requests.statusOn")
          : t("requests.statusOff"),
      })}
    </div>
  );
}

function formatVipTokensCompact(count: number, t: TFunction) {
  return t("vip.balance", {
    count,
  });
}

function formatRequestLimitCompact(
  count: number,
  limit: number | null,
  t: TFunction
) {
  if (limit == null) {
    return t("requests.countUnlimited", {
      count,
    });
  }

  return t("requests.countLimited", {
    count,
    limit,
  });
}

function getPanelPlaylistFooterLabel(
  displayName: string | null | undefined,
  t: TFunction
) {
  return displayName?.trim()
    ? t("footer.openPlaylistForChannel", {
        displayName,
      })
    : t("footer.openPlaylist");
}

function getPanelLocaleShortLabel(locale: AppLocale) {
  return locale === "pt-BR" ? "PT" : locale.slice(0, 2).toUpperCase();
}

function PanelLanguageSelect(props: {
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => Promise<void>;
  isSavingLocale: boolean;
}) {
  const { t } = useLocaleTranslation("common");
  const selectedOption =
    localeOptions.find((option) => option.value === props.locale) ?? null;
  const selectedLabel = getPanelLocaleShortLabel(props.locale);

  return (
    <Select
      value={props.locale}
      onValueChange={(value) => void props.onLocaleChange(value as AppLocale)}
      disabled={props.isSavingLocale}
    >
      <SelectTrigger
        aria-label={`${t("language.label")}: ${selectedOption?.nativeLabel ?? selectedLabel}`}
        title={selectedOption?.nativeLabel ?? selectedLabel}
        className="h-6 w-11 min-w-0 shrink-0 gap-1 self-start border-(--border-strong) bg-(--panel-soft) px-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-none [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-55"
      >
        <span className="text-center">{selectedLabel}</span>
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[3.75rem]">
        {localeOptions.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            textValue={option.nativeLabel}
            title={option.nativeLabel}
            className="py-1.5 pl-8 pr-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            {getPanelLocaleShortLabel(option.value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PreviewPanelLanguageSelect() {
  const { locale, setLocale, isSavingLocale } = useAppLocale();

  async function setPreviewPanelLocale(nextLocale: AppLocale) {
    persistPanelStoredLocale(nextLocale);
    await setLocale(nextLocale);
  }

  return (
    <PanelLanguageSelect
      locale={locale}
      onLocaleChange={setPreviewPanelLocale}
      isSavingLocale={isSavingLocale}
    />
  );
}
