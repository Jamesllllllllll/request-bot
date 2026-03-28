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
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Disc3,
  GripVertical,
  LoaderCircle,
  Play,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
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
import { toExtensionApiUrl } from "./config";
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
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [transientNotice, setTransientNotice] =
    useState<TransientPanelNotice | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmingRemoveItemId, setConfirmingRemoveItemId] = useState<
    string | null
  >(null);
  const [expandedModeratorItemId, setExpandedModeratorItemId] = useState<
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
  const editModeAvailable = bootstrap?.viewer.canEditOwnRequest ?? false;
  const effectiveReplaceExisting = editModeAvailable && replaceExisting;
  const queueCount = bootstrap?.playlist.items.length ?? 0;
  const managementPermissions = bootstrap?.management.permissions;
  const canManagePlaylist = managementPermissions?.canManageRequests ?? false;
  const canManageVipRequests =
    !!managementPermissions?.canManageRequests &&
    !!managementPermissions?.canManageVipTokens;
  const showViewerSearchActions =
    !!bootstrap?.viewer.canRequest || !!bootstrap?.viewer.canVipRequest;
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
  const showEditToggle =
    bootstrap?.viewer.isLinked && (bootstrap?.viewer.canRequest ?? false);
  const waitingForAuthorization =
    helperState === "loading" ||
    (helperState === "ready" && !auth && !helperTimedOut);
  const waitingForBootstrap = !!auth?.token && !bootstrap && !bootstrapError;
  const showLoadingSkeleton =
    waitingForAuthorization ||
    waitingForBootstrap ||
    (!!auth?.token && !bootstrap && !bootstrapError);

  useEffect(() => {
    document.documentElement.classList.add("extension-mode");
    document.body.classList.add("extension-mode");

    return () => {
      document.documentElement.classList.remove("extension-mode");
      document.body.classList.remove("extension-mode");
    };
  }, []);

  useEffect(() => {
    if (editModeAvailable && activeRequestCount === 1) {
      setReplaceExisting(true);
      return;
    }

    setReplaceExisting(false);
  }, [activeRequestCount, editModeAvailable]);

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

  const viewerProfile = bootstrap?.viewer.profile ?? null;

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

      startTransition(() => {
        setBootstrap((current) =>
          current
            ? {
                ...current,
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

  async function handleSubmitRequest(input: {
    songId: string;
    requestKind: "regular" | "vip";
  }) {
    if (!auth?.token) {
      return;
    }

    setPendingAction(`${input.songId}:${input.requestKind}`);
    setTransientNotice(null);

    try {
      const endpoint = effectiveReplaceExisting
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
          body: JSON.stringify(input),
        }
      );

      showTransientNotice("success", result.message ?? "Request updated.");
      await refreshPanelState({
        token: auth.token,
      });
      startTransition(() => {
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
      <div className="mx-auto flex min-h-screen w-full max-w-[320px] flex-col bg-(--panel)">
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
                      ? `${viewerProfile.displayName} · ${formatVipTokensCompact(viewerProfile.vipTokensAvailable)} · ${formatRequestLimitCompact(activeRequestCount, activeRequestLimit)}`
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
            className="flex min-h-0 flex-1 flex-col gap-0 border-b border-(--border-strong)"
          >
            <TabsList
              variant="line"
              className="grid h-auto w-full grid-cols-2 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0"
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
              className="mt-0 flex-1 overflow-y-auto"
            >
              <div>
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
                        viewerProfile={viewerProfile}
                        canManagePlaylist={canManagePlaylist}
                        canManageVipRequests={canManageVipRequests}
                        canReorderPlaylist={canReorderPlaylist}
                        pendingAction={pendingAction}
                        confirmingRemoveItemId={confirmingRemoveItemId}
                        onConfirmRemoveChange={setConfirmingRemoveItemId}
                        expandedModeratorItemId={expandedModeratorItemId}
                        onExpandedModeratorItemChange={
                          setExpandedModeratorItemId
                        }
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

            <TabsContent value="search" className="mt-0 flex-1 overflow-y-auto">
              <div className="border-b border-(--border) px-3 py-2">
                <form className="flex gap-1" onSubmit={handleSearchSubmit}>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search title, artist, or album"
                    className="h-8 rounded-none border-(--border-strong) px-2 py-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-(--brand) focus-visible:ring-offset-0"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 rounded-none px-2 shadow-none"
                    disabled={
                      searching || !auth?.token || searchQuery.trim().length < 3
                    }
                  >
                    {searching ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </form>

                {showEditToggle ? (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-(--muted)">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(event) =>
                        setReplaceExisting(event.target.checked)
                      }
                      className="h-3.5 w-3.5 rounded-none border-(--border)"
                      disabled={!editModeAvailable}
                    />
                    Edit current request
                  </label>
                ) : null}

                {searchError ? (
                  <p className="mt-2 text-[11px] text-(--danger)">
                    {searchError}
                  </p>
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
                                    !bootstrap?.viewer.canRequest ||
                                    pendingAction === actionKey
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
                                    ? effectiveReplaceExisting
                                      ? "Editing..."
                                      : "Adding..."
                                    : effectiveReplaceExisting
                                      ? "Edit"
                                      : "Add"}
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 rounded-none px-2 text-[11px] shadow-none"
                                  disabled={
                                    !songId ||
                                    !bootstrap?.viewer.canVipRequest ||
                                    pendingAction === vipActionKey
                                  }
                                  onClick={() => {
                                    if (!songId) {
                                      return;
                                    }

                                    void handleSubmitRequest({
                                      songId,
                                      requestKind: "vip",
                                    });
                                  }}
                                >
                                  {pendingAction === vipActionKey
                                    ? effectiveReplaceExisting
                                      ? "Editing..."
                                      : "Adding..."
                                    : effectiveReplaceExisting
                                      ? "Edit VIP"
                                      : "VIP"}
                                </Button>
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
            </TabsContent>
          </Tabs>
        )}
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
  const [expandedModeratorItemId, setExpandedModeratorItemId] = useState<
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
  const [replaceExisting, setReplaceExisting] = useState(false);
  const latestTransientNoticeIdRef = useRef(0);
  const latestSearchRequestRef = useRef(0);
  const removeConfirmRef = useRef<HTMLDivElement | null>(null);

  const activeRequests = getDemoViewerActiveRequests(
    playlist,
    mockModeratorViewerProfile.twitchUserId
  );
  const activeRequestCount = activeRequests.length;
  const activeRequestLimit = mockModeratorViewerProfile.activeRequestLimit;
  const editModeAvailable = activeRequestCount === 1;
  const effectiveReplaceExisting = editModeAvailable && replaceExisting;
  const currentPlaylistItemId = playlist.currentItemId;
  const queueCount = playlist.items.length;
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

  useEffect(() => {
    if (editModeAvailable && activeRequestCount === 1) {
      setReplaceExisting(true);
      return;
    }

    setReplaceExisting(false);
  }, [activeRequestCount, editModeAvailable]);

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
        const targetItem = current.items.find(
          (item) => getString(item, "id") === mutation.itemId
        );
        if (!targetItem) {
          return current;
        }

        const orderedItems = [targetItem].concat(
          current.items.filter(
            (item) => getString(item, "id") !== mutation.itemId
          )
        );

        return {
          currentItemId: mutation.itemId,
          items: orderedItems.map((item, index) => ({
            ...item,
            position: index + 1,
            status:
              getString(item, "id") === mutation.itemId ? "current" : "queued",
          })),
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
          items: current.items.map((item) =>
            getString(item, "id") === mutation.itemId
              ? {
                  ...item,
                  requestKind: mutation.requestKind,
                }
              : item
          ),
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

  async function handleSubmitRequest(input: {
    songId: string;
    requestKind: "regular" | "vip";
  }) {
    const song =
      searchResults?.items.find(
        (item) => getString(item, "id") === input.songId
      ) ?? null;

    if (!song) {
      showTransientMessage("danger", "That song is unavailable right now.");
      return;
    }

    if (
      !effectiveReplaceExisting &&
      activeRequestLimit != null &&
      activeRequestCount >= activeRequestLimit
    ) {
      showTransientMessage(
        "danger",
        "Remove one of your requests or turn on Edit current request."
      );
      return;
    }

    setPendingAction(`${input.songId}:${input.requestKind}`);
    setTransientNotice(null);

    startTransition(() => {
      setPlaylist((current) =>
        applyDemoViewerRequestMutation({
          playlist: current,
          viewerProfile: mockModeratorViewerProfile,
          song,
          requestKind: input.requestKind,
          replaceExisting: effectiveReplaceExisting,
        })
      );
      setActiveTab("playlist");
    });

    showTransientMessage(
      "success",
      effectiveReplaceExisting ? "Request updated." : "Request added."
    );
    setPendingAction(null);
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
      <div className="mx-auto flex min-h-[560px] w-full max-w-[320px] flex-col border border-(--border-strong) bg-(--panel)">
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
          className="flex min-h-0 flex-1 flex-col gap-0 border-b border-(--border-strong)"
        >
          <TabsList
            variant="line"
            className="grid h-auto w-full grid-cols-2 gap-0 rounded-none border-b border-(--border-strong) bg-(--panel) p-0"
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

          <TabsContent value="playlist" className="mt-0 flex-1 overflow-y-auto">
            <div>
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

              <div className="flex-1 overflow-y-auto">
                {playlist.items.map((item, index) => {
                  const itemId =
                    getString(item, "id") ?? `preview-item-${index}`;

                  return (
                    <PanelPlaylistRow
                      key={itemId}
                      item={item}
                      itemId={itemId}
                      currentItemId={playlist.currentItemId}
                      viewerProfile={mockModeratorViewerProfile}
                      canManagePlaylist
                      canManageVipRequests
                      canReorderPlaylist={canReorderPlaylist}
                      pendingAction={pendingAction}
                      confirmingRemoveItemId={confirmingRemoveItemId}
                      onConfirmRemoveChange={setConfirmingRemoveItemId}
                      expandedModeratorItemId={expandedModeratorItemId}
                      onExpandedModeratorItemChange={setExpandedModeratorItemId}
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
                      onRemoveRequest={handleRemoveRequest}
                      onPlaylistMutation={handlePlaylistMutation}
                    />
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-0 flex-1 overflow-y-auto">
            <div className="border-b border-(--border) px-3 py-2">
              <form className="flex gap-1" onSubmit={handleSearchSubmit}>
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search title, artist, or album"
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

              <label className="mt-2 flex items-center gap-2 text-[11px] text-(--muted)">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                  className="h-3.5 w-3.5 rounded-none border-(--border)"
                  disabled={!editModeAvailable}
                />
                Edit current request
              </label>

              {searchError ? (
                <p className="mt-2 text-[11px] text-(--danger)">
                  {searchError}
                </p>
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
                              disabled={!songId || pendingAction === actionKey}
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
                                ? effectiveReplaceExisting
                                  ? "Editing..."
                                  : "Adding..."
                                : effectiveReplaceExisting
                                  ? "Edit"
                                  : "Add"}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 rounded-none px-2 text-[11px] shadow-none"
                              disabled={
                                !songId || pendingAction === vipActionKey
                              }
                              onClick={() => {
                                if (!songId) {
                                  return;
                                }

                                void handleSubmitRequest({
                                  songId,
                                  requestKind: "vip",
                                });
                              }}
                            >
                              {pendingAction === vipActionKey
                                ? effectiveReplaceExisting
                                  ? "Editing..."
                                  : "Adding..."
                                : effectiveReplaceExisting
                                  ? "Edit VIP"
                                  : "VIP"}
                            </Button>
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
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function PanelPlaylistRow(props: {
  item: PanelPlaylistItem;
  itemId: string;
  currentItemId: string | null;
  viewerProfile: PanelBootstrapResponse["viewer"]["profile"];
  canManagePlaylist: boolean;
  canManageVipRequests: boolean;
  canReorderPlaylist: boolean;
  pendingAction: string | null;
  confirmingRemoveItemId: string | null;
  onConfirmRemoveChange: (itemId: string | null) => void;
  expandedModeratorItemId: string | null;
  onExpandedModeratorItemChange: (itemId: string | null) => void;
  removeConfirmRef: RefObject<HTMLDivElement | null>;
  draggingItemId: string | null;
  dropTargetState: PanelDropTargetState;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragHover: (itemId: string, edge: Edge) => void;
  onDragLeave: () => void;
  onReorder: (sourceItemId: string, targetItemId: string, edge: Edge) => void;
  onRemoveRequest: (itemId: string) => Promise<void>;
  onPlaylistMutation: (mutation: PanelPlaylistMutation) => Promise<void>;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const isCurrent = props.itemId === props.currentItemId;
  const isViewerRequest =
    props.viewerProfile != null &&
    getString(props.item, "requestedByTwitchUserId") ===
      props.viewerProfile.twitchUserId;
  const isQueuedViewerRequest =
    isViewerRequest && getString(props.item, "status") === "queued";
  const isVipRequest = getString(props.item, "requestKind") === "vip";
  const removeActionKey = `remove:${props.itemId}`;
  const deleteActionKey = `deleteItem:${props.itemId}`;
  const setCurrentActionKey = `setCurrent:${props.itemId}`;
  const markPlayedActionKey = `markPlayed:${props.itemId}`;
  const nextRequestKind = isVipRequest ? "regular" : "vip";
  const changeRequestKindActionKey = `changeRequestKind:${props.itemId}:${nextRequestKind}`;
  const canDeleteItem = props.canManagePlaylist || isQueuedViewerRequest;
  const canSetCurrent = props.canManagePlaylist && !isCurrent;
  const canMarkPlayed = props.canManagePlaylist && isCurrent;
  const canToggleVipRequest =
    !!props.canManageVipRequests && !!getString(props.item, "requestedByLogin");
  const canOpenManageTray =
    props.canManagePlaylist &&
    (canToggleVipRequest || canSetCurrent || canMarkPlayed || canDeleteItem);
  const isManageTrayOpen = props.expandedModeratorItemId === props.itemId;
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
        isViewerRequest
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
            open={canOpenManageTray && isManageTrayOpen}
            onOpenChange={(open) => {
              if (!canOpenManageTray) {
                return;
              }

              props.onExpandedModeratorItemChange(open ? props.itemId : null);
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
              className="flex items-start gap-2 px-3 py-2"
            >
              {isCurrent ? (
                <div className="flex shrink-0 items-start justify-center pt-0.5">
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
                </div>
              ) : isVipRequest ? (
                <div className="flex shrink-0 items-start justify-center pt-0.5">
                  <span className="inline-flex h-5 items-center justify-center rounded-full bg-fuchsia-100 px-1.5 text-[9px] leading-none font-semibold tracking-[0.12em] text-fuchsia-700 uppercase">
                    VIP
                  </span>
                </div>
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                  {formatSongLabel(props.item)}
                </p>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                  {formatRequesterLine(props.item)}
                </p>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                {canOpenManageTray ? (
                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 rounded-none px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                    >
                      Manage
                      {isManageTrayOpen ? (
                        <ChevronUp className="ml-1 h-3 w-3" />
                      ) : (
                        <ChevronDown className="ml-1 h-3 w-3" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                ) : canDeleteItem ? (
                  confirmingRemove ? (
                    <div
                      className="flex items-center gap-1 text-[10px] text-(--muted)"
                      ref={props.removeConfirmRef}
                    >
                      <span>Remove?</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 rounded-none px-0 text-(--danger) shadow-none hover:bg-(--danger)/10 hover:text-(--danger)"
                        onClick={() => {
                          void props.onRemoveRequest(props.itemId);
                        }}
                        disabled={props.pendingAction === removeActionKey}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                        onClick={() => props.onConfirmRemoveChange(null)}
                        disabled={props.pendingAction === removeActionKey}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                      onClick={() => props.onConfirmRemoveChange(props.itemId)}
                      title="Remove request"
                      aria-label="Remove request"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )
                ) : null}
              </div>
            </motion.div>

            <AnimatePresence initial={false}>
              {canOpenManageTray && isManageTrayOpen ? (
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

                      {canSetCurrent ? (
                        <PanelActionIconButton
                          label="Play now"
                          onClick={() => {
                            void props.onPlaylistMutation({
                              action: "setCurrent",
                              itemId: props.itemId,
                            });
                          }}
                          disabled={props.pendingAction === setCurrentActionKey}
                        >
                          {props.pendingAction === setCurrentActionKey ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </PanelActionIconButton>
                      ) : null}

                      {canMarkPlayed ? (
                        <PanelActionIconButton
                          label="Mark played"
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
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </PanelActionIconButton>
                      ) : null}

                      {canDeleteItem ? (
                        confirmingRemove ? (
                          <div
                            className="flex items-center gap-1 text-[10px] text-(--muted)"
                            ref={props.removeConfirmRef}
                          >
                            <span>Delete item?</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--danger) shadow-none hover:bg-(--danger)/10 hover:text-(--danger)"
                              onClick={() => {
                                void props.onPlaylistMutation({
                                  action: "deleteItem",
                                  itemId: props.itemId,
                                });
                              }}
                              disabled={props.pendingAction === deleteActionKey}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                              onClick={() => props.onConfirmRemoveChange(null)}
                              disabled={props.pendingAction === deleteActionKey}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <PanelActionIconButton
                            label="Delete item"
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

function getNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSongLabel(item: Record<string, unknown>) {
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
  const updatedAt = getNumber(item, "updatedAt");
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

function formatVipTokensCompact(count: number) {
  return count === 1 ? "1 VIP token" : `${count} VIP tokens`;
}

function formatRequestLimitCompact(count: number, limit: number | null) {
  if (limit == null) {
    return `${count} request${count === 1 ? "" : "s"}`;
  }

  return `${count}/${limit} requests`;
}
