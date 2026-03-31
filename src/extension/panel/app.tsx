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
import {
  Check,
  CircleAlert,
  CircleCheckBig,
  Disc3,
  GripVertical,
  LoaderCircle,
  MoreHorizontal,
  PencilLine,
  Play,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  getQueuedPositionsFromRegularOrder,
  getUpdatedPositionsAfterSetCurrent,
  getUpdatedQueuedPositionsAfterKindChange,
} from "~/lib/playlist/order";
import {
  ADD_REQUESTS_WHEN_LIVE_MESSAGE,
  areChannelRequestsOpen,
} from "~/lib/request-availability";
import {
  getVipTokenAutomationDetails,
  getVipTokenRedemptionDescription,
} from "~/lib/vip-token-automation";
import { toExtensionApiUrl, toExtensionAppUrl } from "./config";
import {
  applyDemoViewerRequestMutation,
  createMockModeratorPlaylistItems,
  getDemoViewerActiveRequests,
  mockModeratorViewerProfile,
  type PanelDemoPlaylist,
} from "./demo";
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
    showPlaylistPositions: boolean;
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
    }
  | {
      query: string;
      requestKind: "regular" | "vip";
      requestMode: "random" | "choice";
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

const PANEL_VISIBLE_REFRESH_INTERVAL_MS = 5000;

export function ExtensionPanelApp(props: { apiBaseUrl?: string }) {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchResults, setSearchResults] =
    useState<PanelSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
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
  const latestSearchRequestRef = useRef(0);
  const latestTransientNoticeIdRef = useRef(0);
  const removeConfirmRef = useRef<HTMLDivElement | null>(null);

  const activeRequestCount = bootstrap?.viewer.activeRequests.length ?? 0;
  const activeRequestLimit =
    bootstrap?.viewer.profile?.activeRequestLimit ?? null;
  const queueCount = bootstrap?.playlist.items.length ?? 0;
  const showPlaylistPositions =
    bootstrap?.settings.showPlaylistPositions ?? false;
  const vipTokenAutomationDetails = getVipTokenAutomationDetails(
    bootstrap?.settings ?? {}
  );
  const managementPermissions = bootstrap?.management.permissions;
  const canManagePlaylist = managementPermissions?.canManageRequests ?? false;
  const canManageVipRequests =
    !!managementPermissions?.canManageRequests &&
    !!managementPermissions?.canManageVipTokens;
  const channelRequestsOpen = areChannelRequestsOpen(bootstrap?.channel ?? {});
  const showViewerSearchActions =
    channelRequestsOpen &&
    (!!bootstrap?.viewer.canRequest || !!bootstrap?.viewer.canVipRequest);
  const viewerProfile = bootstrap?.viewer.profile ?? null;
  const vipSearchDisabledReason = !channelRequestsOpen
    ? ADD_REQUESTS_WHEN_LIVE_MESSAGE
    : viewerProfile && viewerProfile.vipTokensAvailable < 1
      ? "Not enough VIP tokens."
      : null;
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
    ? "Mark the current song played before shuffling."
    : "Shuffle the queue.";
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

  useEffect(() => {
    document.documentElement.classList.add("extension-mode");
    document.body.classList.add("extension-mode");

    return () => {
      document.documentElement.classList.remove("extension-mode");
      document.body.classList.remove("extension-mode");
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

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
    let cancelled = false;

    void loadTwitchExtensionHelper()
      .then(() => {
        if (!cancelled) {
          setHelperState("ready");
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setHelperState("error");
        setHelperError(
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to load the Twitch extension helper."
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
      setHelperState("error");
      setHelperError("The Twitch extension helper is unavailable.");
      return;
    }

    authCallbackRegisteredRef.current = true;
    helper.onAuthorized((nextAuth) => {
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
        const data = await fetchExtensionJson<PanelBootstrapResponse>(
          auth.token,
          "/api/extension/bootstrap",
          props.apiBaseUrl
        );

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setBootstrap(data);
          setBootstrapError(null);
          setConnectionMessage(null);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isRetriableExtensionError(error)) {
          const retryDelayMs = getRetryDelayMs(attempt, 1500, 30000);
          setConnectionMessage(
            `Panel is still connecting. Retrying in ${formatRetryDelay(retryDelayMs)}.`
          );
          retryTimeout = window.setTimeout(() => {
            void loadBootstrap(attempt + 1);
          }, retryDelayMs);
          return;
        }

        setBootstrapError(getErrorText(error, "Unable to load panel state."));
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
  }) {
    const token = input?.token ?? auth?.token;
    if (!token) {
      return null;
    }

    try {
      const data = await fetchExtensionJson<PanelStateResponse>(
        token,
        "/api/extension/state",
        props.apiBaseUrl
      );

      if (
        areChannelRequestsOpen(bootstrap?.channel ?? {}) !==
        areChannelRequestsOpen(data.channel)
      ) {
        const refreshedBootstrap =
          await fetchExtensionJson<PanelBootstrapResponse>(
            token,
            "/api/extension/bootstrap",
            props.apiBaseUrl
          );

        startTransition(() => {
          setBootstrap(refreshedBootstrap);
          setBootstrapError(null);
          setConnectionMessage(null);
        });

        return data;
      }

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
      if (!input?.silent) {
        setBootstrapError(
          getErrorText(error, "Unable to refresh panel state.")
        );
      }
      return null;
    }
  }

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
        `Connection interrupted. Retrying in ${formatRetryDelay(retryDelayMs)}.`
      );
      scheduleNextRefresh(retryDelayMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }
        void refreshIfVisible();
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

  async function runSearch(query: string) {
    if (!auth?.token) {
      return;
    }

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
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
        query: normalizedQuery,
        page: "1",
        pageSize: "10",
      });
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

      setSearchError(getErrorText(error, "Unable to search songs."));
    } finally {
      if (latestSearchRequestRef.current === requestId) {
        setSearching(false);
      }
    }
  }

  useEffect(() => {
    if (!auth?.token) {
      return;
    }

    void runSearch(debouncedSearchQuery);
  }, [auth?.token, debouncedSearchQuery, props.apiBaseUrl]);

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();
    if (query.length < 3 || !auth?.token) {
      return;
    }

    if (debouncedSearchQuery !== searchQuery) {
      setDebouncedSearchQuery(searchQuery);
      return;
    }

    void runSearch(query);
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
                }
              : {
                  query: input.query.trim(),
                  requestMode: input.requestMode,
                }),
            requestKind: input.requestKind,
            itemId: editingRequestItemId ?? undefined,
          }),
        }
      );

      showTransientNotice("success", result.message ?? "Request updated.");
      await refreshPanelState({
        token: auth.token,
      });
      startTransition(() => {
        setEditingRequestItemId(null);
        setActiveTab("playlist");
      });
    } catch (error) {
      await refreshPanelState({
        token: auth.token,
        silent: true,
      });
      showTransientNotice(
        "danger",
        getErrorText(error, "Unable to update request.")
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

      showTransientNotice("success", result.message ?? "Request removed.");
      setConfirmingRemoveItemId(null);
      setExpandedActionItemId((current) =>
        current === itemId ? null : current
      );
      setEditingRequestItemId((current) =>
        current === itemId ? null : current
      );
      await refreshPanelState({
        token: auth.token,
      });
    } catch (error) {
      await refreshPanelState({
        token: auth.token,
        silent: true,
      });
      showTransientNotice(
        "danger",
        getErrorText(error, "Unable to remove request.")
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
      });

      if (mutation.action !== "reorderItems") {
        showTransientNotice(
          "success",
          getPlaylistMutationSuccessMessage(mutation, response)
        );
      }
    } catch (error) {
      await refreshPanelState({
        token: auth.token,
        silent: true,
      });
      showTransientNotice(
        "danger",
        getErrorText(error, "Unable to update the playlist.")
      );
    } finally {
      setPendingAction(null);
    }
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
    ? `${bootstrap.channel.displayName}'s Request Playlist`
    : "Request Playlist";
  const footerPlaylistHref = bootstrap?.channel?.slug
    ? toExtensionAppUrl(`/${bootstrap.channel.slug}`, props.apiBaseUrl)
    : null;
  const footerPlaylistLabel = getPanelPlaylistFooterLabel(
    bootstrap?.channel?.displayName
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-sm font-semibold text-(--text)">
                    {channelTitle}
                  </h1>
                  <p className="truncate text-[11px] leading-4 text-(--muted)">
                    {viewerProfile
                      ? `${viewerProfile.displayName} · ${formatVipTokensCompact(viewerProfile.vipTokensAvailable)} available · ${formatRequestLimitCompact(activeRequestCount, activeRequestLimit)}`
                      : bootstrap?.viewer.isLinked
                        ? (bootstrap.viewer.access.reason ??
                          "Viewer state is still loading.")
                        : "Share Twitch identity to request."}
                  </p>
                </div>

                {viewerProfile?.profileImageUrl ? (
                  <img
                    src={viewerProfile.profileImageUrl}
                    alt={viewerProfile.displayName}
                    className="mt-0.5 block shrink-0 rounded-full object-cover"
                    style={{
                      width: 32,
                      height: 32,
                      minWidth: 32,
                      minHeight: 32,
                      maxWidth: 32,
                      maxHeight: 32,
                    }}
                  />
                ) : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {!bootstrap?.viewer.isLinked ? (
                  <Button
                    size="sm"
                    className="h-7 rounded-none px-2 text-[11px] shadow-none"
                    onClick={handleRequestIdentityShare}
                    disabled={helperState !== "ready"}
                  >
                    Share Twitch Identity
                  </Button>
                ) : null}
              </div>

              {viewerProfile ||
              vipTokenAutomationDetails.earningRules.length ? (
                <Collapsible
                  open={vipHelpOpen}
                  onOpenChange={setVipHelpOpen}
                  className="mt-2"
                >
                  <div className="overflow-hidden border border-(--border)">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 bg-(--panel-soft) px-2.5 py-2 text-left"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text)">
                          VIP tokens
                        </span>
                        <span className="text-[10px] text-(--muted)">
                          {vipHelpOpen ? "Hide" : "Show"}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t border-(--border) bg-(--panel) px-2.5 py-2">
                      <div className="grid gap-1.5 text-[11px] leading-4 text-(--muted)">
                        <p>
                          {viewerProfile
                            ? `${formatVipTokensCompact(viewerProfile.vipTokensAvailable)} available.`
                            : "Sign in to see your VIP token balance."}
                        </p>
                        <p>{getVipTokenRedemptionDescription()}</p>
                        {vipTokenAutomationDetails.earningRules.length ? (
                          <div className="grid gap-1">
                            {vipTokenAutomationDetails.earningRules.map(
                              (rule) => (
                                <p key={rule}>{rule}</p>
                              )
                            )}
                          </div>
                        ) : (
                          <p>
                            This channel grants VIP tokens manually right now.
                          </p>
                        )}
                        {vipTokenAutomationDetails.notes.map((note) => (
                          <p key={note}>{note}</p>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ) : null}
            </>
          )}
        </section>

        {helperState === "error" ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />} tone="danger">
            {helperError ?? "Unable to load the Twitch extension helper."}
          </PanelNotice>
        ) : null}

        {helperTimedOut && !auth ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />}>
            Open this page from Twitch Local Test or Hosted Test to receive
            panel authorization.
          </PanelNotice>
        ) : null}

        {bootstrapError ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />} tone="danger">
            {bootstrapError}
          </PanelNotice>
        ) : null}

        {connectionMessage && !bootstrapError ? (
          <PanelNotice
            icon={<LoaderCircle className="h-4 w-4 animate-spin" />}
            tone="default"
          >
            {connectionMessage}
          </PanelNotice>
        ) : null}

        <AnimatePresence initial={false} mode="sync">
          {transientNotice ? (
            <TransientNoticeBanner
              key={transientNotice.id}
              tone={transientNotice.tone}
            >
              {transientNotice.message}
            </TransientNoticeBanner>
          ) : null}
        </AnimatePresence>

        {bootstrap?.setup ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />}>
            {bootstrap.setup.message}
          </PanelNotice>
        ) : null}
        {bootstrap?.channel && !channelRequestsOpen ? (
          <PanelNotice icon={<CircleAlert className="h-4 w-4" />}>
            {ADD_REQUESTS_WHEN_LIVE_MESSAGE}
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
            <TabsList
              variant="line"
              className="grid h-auto w-full shrink-0 grid-cols-2 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0"
            >
              <TabsTrigger
                value="playlist"
                className="h-auto justify-center rounded-none border-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
                style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
              >
                <span className="inline-flex items-center gap-1">
                  <span>Playlist</span>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-current">
                    ({queueCount})
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="search"
                className="h-auto rounded-none border-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
                style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
              >
                Search
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="playlist"
              className="mt-0 min-h-0 flex-1 overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                {canManagePlaylist ? (
                  <div className="flex items-center justify-between border-t border-(--border) px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                      Queue tools
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
                    Queue is empty.
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
                  <form className="flex gap-1" onSubmit={handleSearchSubmit}>
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={
                        editingRequest
                          ? "Search for a song to edit your request"
                          : "Search title, artist, or album"
                      }
                      className="h-8 rounded-none border-(--border-strong) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 rounded-none px-2 shadow-none"
                      disabled={
                        searching ||
                        !auth?.token ||
                        searchQuery.trim().length < 3
                      }
                    >
                      {searching ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </form>

                  {searchError ? (
                    <p className="mt-2 text-[11px] text-(--danger)">
                      {searchError}
                    </p>
                  ) : null}
                  {showViewerSearchActions ? (
                    <PanelSpecialRequestControls
                      query={searchQuery}
                      canRequest={
                        channelRequestsOpen && !!bootstrap?.viewer.canRequest
                      }
                      canVipRequest={
                        channelRequestsOpen && !!bootstrap?.viewer.canVipRequest
                      }
                      vipDisabledReason={vipSearchDisabledReason}
                      pendingAction={pendingAction}
                      isEditingRequest={isEditingRequest}
                      onSubmit={(requestMode, requestKind) => {
                        void handleSubmitRequest({
                          query: searchQuery,
                          requestMode,
                          requestKind,
                        });
                      }}
                    />
                  ) : null}
                </div>

                <div>
                  {searchResults?.items?.length ? (
                    <div>
                      {searchResults.items.map((item, index) => {
                        const songId = getString(item, "id");
                        const actionKey = `${songId ?? "unknown"}:regular`;
                        const vipActionKey = `${songId ?? "unknown"}:vip`;

                        return (
                          <div
                            key={songId ?? `search-result-${index}`}
                            className="border-t border-(--border) px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                                  {formatSearchSongLabel(item)}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                                  {formatSearchSongMeta(item)}
                                </p>
                              </div>
                              {showViewerSearchActions ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-none px-2 text-[11px] shadow-none"
                                    disabled={
                                      !songId ||
                                      !channelRequestsOpen ||
                                      !bootstrap?.viewer.canRequest ||
                                      pendingAction === actionKey
                                    }
                                    title={
                                      !channelRequestsOpen
                                        ? ADD_REQUESTS_WHEN_LIVE_MESSAGE
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (!songId) {
                                        return;
                                      }

                                      void handleSubmitRequest({
                                        songId,
                                        requestKind: "regular",
                                      });
                                    }}
                                  >
                                    {pendingAction === actionKey
                                      ? isEditingRequest
                                        ? "Editing..."
                                        : "Adding..."
                                      : isEditingRequest
                                        ? "Edit"
                                        : "Add"}
                                  </Button>
                                  <PanelSearchVipButton
                                    disabledReason={vipSearchDisabledReason}
                                    disabled={
                                      !songId ||
                                      !channelRequestsOpen ||
                                      !bootstrap?.viewer.canVipRequest ||
                                      pendingAction === vipActionKey
                                    }
                                    pending={pendingAction === vipActionKey}
                                    isEditingRequest={isEditingRequest}
                                    onClick={() => {
                                      if (!songId) {
                                        return;
                                      }

                                      void handleSubmitRequest({
                                        songId,
                                        requestKind: "vip",
                                      });
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : debouncedSearchQuery.trim().length >= 3 && !searching ? (
                    <div className="border-t border-(--border) px-3 py-2 text-[11px] text-(--muted)">
                      No songs matched that search.
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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchResults, setSearchResults] =
    useState<PanelSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const latestTransientNoticeIdRef = useRef(0);
  const latestSearchRequestRef = useRef(0);
  const removeConfirmRef = useRef<HTMLDivElement | null>(null);

  const activeRequests = getDemoViewerActiveRequests(
    playlist,
    mockModeratorViewerProfile.twitchUserId
  );
  const activeRequestCount = activeRequests.length;
  const activeRequestLimit = mockModeratorViewerProfile.activeRequestLimit;
  const currentPlaylistItemId = playlist.currentItemId;
  const queueCount = playlist.items.length;
  const showPlaylistPositions = false;
  const footerPlaylistHref = toExtensionAppUrl("/jimmy-pants");
  const footerPlaylistLabel = getPanelPlaylistFooterLabel("Jimmy Pants_");
  const queuedPlaylistItems = playlist.items.filter(
    (item) => getString(item, "id") !== currentPlaylistItemId
  );
  const canReorderPlaylist = queuedPlaylistItems.length > 1;
  const showShufflePlaylistControl = queuedPlaylistItems.length > 1;
  const canShufflePlaylist =
    showShufflePlaylistControl && currentPlaylistItemId == null;
  const shufflePlaylistTooltip = currentPlaylistItemId
    ? "Mark the current song played before shuffling."
    : "Shuffle the queue.";
  const vipSearchDisabledReason =
    mockModeratorViewerProfile.vipTokensAvailable < 1
      ? "Not enough VIP tokens."
      : null;
  const editingRequest = getViewerEditablePanelItem(
    playlist.items,
    mockModeratorViewerProfile,
    editingRequestItemId
  );
  const isEditingRequest = editingRequest != null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

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

  async function runPreviewSearch(query: string) {
    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    setSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "35",
      });
      if (query.trim()) {
        params.set("query", query.trim());
      }

      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response
        .json()
        .catch(() => null)) as PreviewCatalogSearchResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to search songs.");
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

      setSearchError(getErrorText(error, "Unable to search songs."));
    } finally {
      if (latestSearchRequestRef.current === requestId) {
        setSearching(false);
      }
    }
  }

  useEffect(() => {
    void runPreviewSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (debouncedSearchQuery !== searchQuery) {
      setDebouncedSearchQuery(searchQuery);
      return;
    }

    void runPreviewSearch(searchQuery);
  }

  async function handleSubmitRequest(input: PanelViewerRequestSubmitInput) {
    const normalizedQuery = "query" in input ? input.query.trim() : null;
    const song =
      "songId" in input
        ? (searchResults?.items.find(
            (item) => getString(item, "id") === input.songId
          ) ?? null)
        : input.requestMode === "random"
          ? pickRandomPanelSearchItem(searchResults?.items ?? [])
          : null;

    if (("songId" in input || input.requestMode === "random") && !song) {
      showTransientMessage("danger", "That song is unavailable right now.");
      return;
    }

    if (input.requestMode === "choice" && !normalizedQuery) {
      showTransientMessage("danger", "Type an artist or song first.");
      return;
    }

    if (
      !isEditingRequest &&
      activeRequestLimit != null &&
      activeRequestCount >= activeRequestLimit
    ) {
      showTransientMessage(
        "danger",
        `You already have ${activeRequestLimit} active request${activeRequestLimit === 1 ? "" : "s"} in this playlist.`
      );
      return;
    }

    setPendingAction(getPanelViewerRequestActionKey(input));
    setTransientNotice(null);

    startTransition(() => {
      setPlaylist((current) =>
        applyDemoViewerRequestMutation({
          playlist: current,
          viewerProfile: mockModeratorViewerProfile,
          ...("songId" in input || input.requestMode === "random"
            ? {
                song: song as Record<string, unknown>,
                requestMode: "catalog",
              }
            : {
                query: normalizedQuery ?? "",
                requestMode: input.requestMode,
              }),
          requestKind: input.requestKind,
          replaceExisting: false,
          replaceItemId: editingRequestItemId ?? undefined,
        })
      );
      setEditingRequestItemId(null);
      setActiveTab("playlist");
    });

    showTransientMessage(
      "success",
      isEditingRequest ? "Request updated." : "Request added."
    );
    setPendingAction(null);
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
        getPlaylistMutationSuccessMessage(mutation, {
          ok: true,
        })
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
              <h1 className="truncate text-sm font-semibold text-(--text)">
                Jimmy Pants_'s Request Playlist
              </h1>
              <p className="mt-1 truncate text-[11px] text-(--muted)">
                {mockModeratorViewerProfile.displayName} ·{" "}
                {formatVipTokensCompact(
                  mockModeratorViewerProfile.vipTokensAvailable
                )}{" "}
                ·{" "}
                {formatRequestLimitCompact(
                  activeRequestCount,
                  activeRequestLimit
                )}
              </p>
            </div>
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-(--border-strong) bg-(--panel-soft) text-[10px] font-semibold uppercase text-(--brand-deep)">
              MM
            </div>
          </div>
        </section>

        <AnimatePresence initial={false}>
          {transientNotice ? (
            <TransientNoticeBanner
              key={transientNotice.id}
              tone={transientNotice.tone}
            >
              {transientNotice.message}
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
          <TabsList
            variant="line"
            className="grid h-auto w-full shrink-0 grid-cols-2 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0"
          >
            <TabsTrigger
              value="playlist"
              className="h-auto justify-center rounded-none border-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              <span className="inline-flex items-center gap-1">
                <span>Playlist</span>
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-current">
                  ({queueCount})
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="h-auto rounded-none border-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted) shadow-none after:bottom-0 after:h-px after:bg-(--brand-deep) data-[state=active]:text-(--brand-deep)"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              Search
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="playlist"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <div className="h-full overflow-y-auto">
              {showShufflePlaylistControl ? (
                <div className="flex items-center justify-between border-t border-(--border) px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                    Queue tools
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
                    placeholder={
                      editingRequest
                        ? "Search for a song to edit your request"
                        : "Search title, artist, or album"
                    }
                    className="h-8 rounded-none border-(--border-strong) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 rounded-none px-2 shadow-none"
                    disabled={searching}
                  >
                    {searching ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </form>

                {searchError ? (
                  <p className="mt-2 text-[11px] text-(--danger)">
                    {searchError}
                  </p>
                ) : null}
                <PanelSpecialRequestControls
                  query={searchQuery}
                  canRequest
                  canVipRequest={
                    mockModeratorViewerProfile.vipTokensAvailable >= 1
                  }
                  vipDisabledReason={vipSearchDisabledReason}
                  pendingAction={pendingAction}
                  isEditingRequest={isEditingRequest}
                  onSubmit={(requestMode, requestKind) => {
                    void handleSubmitRequest({
                      query: searchQuery,
                      requestMode,
                      requestKind,
                    });
                  }}
                />
              </div>

              <div>
                {searchResults?.items?.length ? (
                  <div>
                    {searchResults.items.map((item, index) => {
                      const songId = getString(item, "id");
                      const actionKey = `${songId ?? "unknown"}:regular`;
                      const vipActionKey = `${songId ?? "unknown"}:vip`;

                      return (
                        <div
                          key={songId ?? `preview-search-result-${index}`}
                          className="border-t border-(--border) px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                                {formatSearchSongLabel(item)}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                                {formatSearchSongMeta(item)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-none px-2 text-[11px] shadow-none"
                                disabled={
                                  !songId || pendingAction === actionKey
                                }
                                onClick={() => {
                                  if (!songId) {
                                    return;
                                  }

                                  void handleSubmitRequest({
                                    songId,
                                    requestKind: "regular",
                                  });
                                }}
                              >
                                {pendingAction === actionKey
                                  ? isEditingRequest
                                    ? "Editing..."
                                    : "Adding..."
                                  : isEditingRequest
                                    ? "Edit"
                                    : "Add"}
                              </Button>
                              <PanelSearchVipButton
                                disabledReason={vipSearchDisabledReason}
                                disabled={
                                  !songId ||
                                  mockModeratorViewerProfile.vipTokensAvailable <
                                    1 ||
                                  pendingAction === vipActionKey
                                }
                                pending={pendingAction === vipActionKey}
                                isEditingRequest={isEditingRequest}
                                onClick={() => {
                                  if (!songId) {
                                    return;
                                  }

                                  void handleSubmitRequest({
                                    songId,
                                    requestKind: "vip",
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !searching ? (
                  <div className="border-t border-(--border) px-3 py-2 text-[11px] text-(--muted)">
                    No songs matched that search.
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
            aria-label={`Reorder ${formatSongLabel(props.item)}`}
            className={`inline-flex w-7 shrink-0 items-center justify-center border-r border-(--border) text-(--muted) transition ${
              canReorder
                ? "cursor-grab hover:bg-(--panel-soft) hover:text-(--text) active:cursor-grabbing"
                : "cursor-not-allowed opacity-40"
            }`}
            disabled={!canReorder}
            title={
              canReorder ? "Drag to reorder" : "Current song stays in place"
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
                      VIP
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="min-w-0 flex-1 pr-2">
                <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                  {formatSongLabel(props.item)}
                </p>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                  {formatRequesterLine(props.item)}
                </p>
              </div>

              <div className="ml-auto flex shrink-0 self-center items-center gap-1">
                {canOpenActionTray ? (
                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                      title="Request actions"
                      aria-label="Request actions"
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
                          label="Edit request"
                          className="text-(--brand-deep) hover:bg-(--brand-soft) hover:text-(--brand-deep)"
                          onClick={() => props.onEditRequest(props.itemId)}
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </PanelActionIconButton>
                      ) : null}

                      {canToggleVipRequest ? (
                        <PanelActionIconButton
                          label={isVipRequest ? "Make regular" : "Make VIP"}
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
                          label="Play now"
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
                          label="Return to queue"
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
                          label="Mark complete"
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
                                ? "Remove from playlist?"
                                : "Remove request?"}
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
                                ? "Remove from playlist"
                                : "Remove request"
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
  return (
    <div className="mb-2 border border-(--brand) bg-(--brand-soft) px-2 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--brand-deep)">
            Editing request
          </p>
          <p className="mt-1 truncate text-[12px] font-medium text-(--text)">
            {formatSongLabel(props.item)}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-(--muted)">
            Search for a song or use the request buttons below.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 rounded-none px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
          onClick={props.onCancel}
        >
          Cancel
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
  const button = (
    <Button
      size="sm"
      className="h-7 rounded-none px-2 text-[11px] shadow-none"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.pending
        ? props.isEditingRequest
          ? "Editing..."
          : "Adding..."
        : props.isEditingRequest
          ? "Edit VIP"
          : "VIP"}
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

function PanelSpecialRequestControls(props: {
  query: string;
  canRequest: boolean;
  canVipRequest: boolean;
  vipDisabledReason?: string | null;
  pendingAction: string | null;
  isEditingRequest: boolean;
  onSubmit: (
    requestMode: "random" | "choice",
    requestKind: "regular" | "vip"
  ) => void;
}) {
  const normalizedQuery = props.query.trim();
  const regularDisabledReason = getPanelSpecialRequestDisabledReason({
    query: normalizedQuery,
    canRequest: props.canRequest,
  });
  const vipDisabledReason = getPanelSpecialRequestDisabledReason({
    query: normalizedQuery,
    canRequest: props.canVipRequest,
    fallbackReason:
      props.vipDisabledReason ?? "You do not have enough VIP tokens.",
  });

  return (
    <div className="mt-2 grid gap-2 border border-(--border) bg-(--panel-soft) px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--brand-deep)">
        Quick request
      </p>
      <div className="grid gap-2">
        <PanelSpecialRequestRow
          label="Random song"
          disabledReason={regularDisabledReason}
          vipDisabledReason={vipDisabledReason}
          busy={props.pendingAction != null}
          regularPending={
            props.pendingAction ===
            getPanelViewerRequestActionKey({
              query: normalizedQuery,
              requestMode: "random",
              requestKind: "regular",
            })
          }
          vipPending={
            props.pendingAction ===
            getPanelViewerRequestActionKey({
              query: normalizedQuery,
              requestMode: "random",
              requestKind: "vip",
            })
          }
          isEditingRequest={props.isEditingRequest}
          onRegularClick={() => props.onSubmit("random", "regular")}
          onVipClick={() => props.onSubmit("random", "vip")}
        />
        <PanelSpecialRequestRow
          label="Streamer choice"
          disabledReason={regularDisabledReason}
          vipDisabledReason={vipDisabledReason}
          busy={props.pendingAction != null}
          regularPending={
            props.pendingAction ===
            getPanelViewerRequestActionKey({
              query: normalizedQuery,
              requestMode: "choice",
              requestKind: "regular",
            })
          }
          vipPending={
            props.pendingAction ===
            getPanelViewerRequestActionKey({
              query: normalizedQuery,
              requestMode: "choice",
              requestKind: "vip",
            })
          }
          isEditingRequest={props.isEditingRequest}
          onRegularClick={() => props.onSubmit("choice", "regular")}
          onVipClick={() => props.onSubmit("choice", "vip")}
        />
      </div>
    </div>
  );
}

function PanelSpecialRequestRow(props: {
  label: string;
  disabledReason: string | null;
  vipDisabledReason: string | null;
  busy: boolean;
  regularPending: boolean;
  vipPending: boolean;
  isEditingRequest: boolean;
  onRegularClick: () => void;
  onVipClick: () => void;
}) {
  const regularDisabled = props.busy || props.disabledReason != null;
  const vipDisabled = props.busy || props.vipDisabledReason != null;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <p className="text-[11px] text-(--muted)">{props.label}</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-none px-2 text-[11px] shadow-none"
          disabled={regularDisabled}
          onClick={props.onRegularClick}
          title={props.disabledReason ?? undefined}
        >
          {props.regularPending
            ? props.isEditingRequest
              ? "Editing..."
              : "Adding..."
            : props.isEditingRequest
              ? "Edit"
              : "Add"}
        </Button>
        <PanelSearchVipButton
          disabled={vipDisabled}
          disabledReason={props.vipDisabledReason}
          pending={props.vipPending}
          isEditingRequest={props.isEditingRequest}
          onClick={props.onVipClick}
        />
      </div>
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
  response: PanelPlaylistMutationResponse
) {
  if (typeof response?.error === "string" && response.error.trim()) {
    return response.error;
  }

  if (typeof response?.message === "string" && response.message.trim()) {
    return response.message;
  }

  switch (mutation.action) {
    case "setCurrent":
      return "Song is now playing.";
    case "returnToQueue":
      return "Song returned to queue.";
    case "markPlayed":
      return "Song marked played.";
    case "deleteItem":
      return "Playlist item removed.";
    case "changeRequestKind":
      return mutation.requestKind === "vip"
        ? "Request changed to VIP."
        : "Request changed to regular.";
    case "shufflePlaylist":
      return "Playlist shuffled.";
    case "reorderItems":
      return "Playlist order updated.";
    default:
      return "Playlist updated.";
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

function formatSongLabel(item: Record<string, unknown>) {
  const warningCode = getString(item, "warningCode");
  const requestedQuery = getString(item, "requestedQuery");
  if (warningCode === "streamer_choice") {
    return requestedQuery
      ? `Streamer choice: ${requestedQuery}`
      : "Streamer choice";
  }

  const artist = getString(item, "songArtist");
  const title = getString(item, "songTitle") ?? "Unknown song";
  return artist ? `${artist} - ${title}` : title;
}

function formatRequesterLine(item: Record<string, unknown>) {
  const requester =
    getString(item, "requestedByDisplayName") ??
    getString(item, "requestedByLogin") ??
    "Unknown requester";
  const addedAt = formatCompactRelativeTimestamp(getNumber(item, "createdAt"));
  const editedAt = formatEditedTimestamp(item);

  return editedAt
    ? `${requester} · Added ${addedAt} · Edited ${editedAt}`
    : `${requester} · Added ${addedAt}`;
}

function formatEditedTimestamp(item: Record<string, unknown>) {
  const updatedAt = getNumber(item, "editedAt");
  const createdAt = getNumber(item, "createdAt");

  if (updatedAt == null || createdAt == null || updatedAt <= createdAt) {
    return null;
  }

  return formatCompactRelativeTimestamp(updatedAt);
}

function formatCompactRelativeTimestamp(timestamp: number | null) {
  if (timestamp == null) {
    return "recent";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 10) {
    return "now";
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

function formatSearchSongLabel(item: Record<string, unknown>) {
  const artist = getString(item, "artist");
  const title = getString(item, "title") ?? "Unknown song";
  return artist ? `${artist} - ${title}` : title;
}

function formatSearchSongMeta(item: Record<string, unknown>) {
  return [
    getString(item, "album"),
    getString(item, "creator"),
    getString(item, "tuning"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function getPanelViewerRequestActionKey(input: PanelViewerRequestSubmitInput) {
  if ("songId" in input) {
    return `${input.songId}:${input.requestKind}`;
  }

  return `special:${input.requestMode}:${input.requestKind}:${input.query.trim().toLowerCase()}`;
}

function getPanelSpecialRequestDisabledReason(input: {
  query: string;
  canRequest: boolean;
  fallbackReason?: string;
}) {
  if (input.query.length < 2) {
    return "Type at least 2 characters first.";
  }

  if (!input.canRequest) {
    return input.fallbackReason ?? "You cannot request songs right now.";
  }

  return null;
}

function pickRandomPanelSearchItem(items: Array<Record<string, unknown>>) {
  if (items.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

function formatVipTokensCompact(count: number) {
  return count === 1 ? "1 VIP token" : `${count} VIP tokens`;
}

function formatRequestLimitCompact(count: number, limit: number | null) {
  if (limit == null) {
    return `${count} request${count === 1 ? "" : "s"}`;
  }

  return `${count}/${limit} requests`;
}

function getPanelPlaylistFooterLabel(displayName: string | null | undefined) {
  return displayName?.trim()
    ? `Open ${displayName}'s playlist on RockList.Live`
    : "Open playlist on RockList.Live";
}
