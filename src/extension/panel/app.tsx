import {
  Check,
  CircleAlert,
  LoaderCircle,
  Play,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { toExtensionApiUrl } from "./config";
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

type PanelSearchResponse = {
  items: Array<Record<string, unknown>>;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

type TransientPanelNotice = {
  id: number;
  message: string;
  tone: "danger" | "success";
};

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
  const showEditToggle =
    bootstrap?.viewer.isLinked && (bootstrap?.viewer.canRequest ?? false);
  const waitingForAuthorization =
    helperState === "loading" ||
    (helperState === "ready" && !auth && !helperTimedOut);
  const waitingForBootstrap = !!auth?.token && !bootstrap && !bootstrapError;
  const showLoadingSkeleton = waitingForAuthorization || waitingForBootstrap;

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

    const loadBootstrap = async () => {
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
        });
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(getErrorText(error, "Unable to load panel state."));
        }
      }
    };

    void loadBootstrap();
    const interval = window.setInterval(() => {
      void loadBootstrap();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
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

  async function refreshBootstrapState(token = auth?.token) {
    if (!token) {
      return null;
    }

    const data = await fetchExtensionJson<PanelBootstrapResponse>(
      token,
      "/api/extension/bootstrap",
      props.apiBaseUrl
    );

    startTransition(() => {
      setBootstrap(data);
      setBootstrapError(null);
    });

    return data;
  }

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
      await refreshBootstrapState(auth.token);
      startTransition(() => {
        setActiveTab("playlist");
      });
    } catch (error) {
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
      await refreshBootstrapState(auth.token);
    } catch (error) {
      showTransientNotice(
        "danger",
        getErrorText(error, "Unable to remove request.")
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePlaylistMutation(
    mutation:
      | { action: "setCurrent"; itemId: string }
      | { action: "markPlayed"; itemId: string }
      | { action: "deleteItem"; itemId: string }
      | {
          action: "changeRequestKind";
          itemId: string;
          requestKind: "regular" | "vip";
        }
  ) {
    if (!auth?.token) {
      return;
    }

    const actionKey =
      mutation.action === "changeRequestKind"
        ? `${mutation.action}:${mutation.itemId}:${mutation.requestKind}`
        : `${mutation.action}:${mutation.itemId}`;

    setPendingAction(actionKey);
    setTransientNotice(null);

    try {
      const response = await fetchExtensionJson<{
        error?: string;
        ok?: boolean;
      }>(auth.token, "/api/extension/playlist", props.apiBaseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(mutation),
      });

      setConfirmingRemoveItemId((current) =>
        current === mutation.itemId ? null : current
      );
      await refreshBootstrapState(auth.token);

      showTransientNotice(
        "success",
        getPlaylistMutationSuccessMessage(mutation, response)
      );
    } catch (error) {
      showTransientNotice(
        "danger",
        getErrorText(error, "Unable to update the playlist.")
      );
    } finally {
      setPendingAction(null);
    }
  }

  function handleRequestIdentityShare() {
    getTwitchExtensionHelper()?.actions.requestIdShare();
  }

  const channelTitle = bootstrap?.channel?.displayName
    ? `${bootstrap.channel.displayName}'s Request Playlist`
    : "Request Playlist";

  return (
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
          Open this page from Twitch Local Test or Hosted Test to receive panel
          authorization.
        </PanelNotice>
      ) : null}

      {bootstrapError ? (
        <PanelNotice icon={<CircleAlert className="h-4 w-4" />} tone="danger">
          {bootstrapError}
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

          <TabsContent value="playlist" className="mt-0 flex-1 overflow-y-auto">
            <div>
              {bootstrap?.playlist.items.length ? (
                bootstrap.playlist.items.map((item, index) => {
                  const itemId = getString(item, "id") ?? `queue-item-${index}`;
                  const isCurrent = itemId === bootstrap.playlist.currentItemId;
                  const isViewerRequest =
                    viewerProfile != null &&
                    getString(item, "requestedByTwitchUserId") ===
                      viewerProfile.twitchUserId;
                  const isQueuedViewerRequest =
                    isViewerRequest && getString(item, "status") === "queued";
                  const isVipRequest = getString(item, "requestKind") === "vip";
                  const requestLabel = isCurrent
                    ? "Now Playing"
                    : formatRequestKind(item);
                  const removeActionKey = `remove:${itemId}`;
                  const deleteActionKey = `deleteItem:${itemId}`;
                  const setCurrentActionKey = `setCurrent:${itemId}`;
                  const markPlayedActionKey = `markPlayed:${itemId}`;
                  const nextRequestKind = isVipRequest ? "regular" : "vip";
                  const changeRequestKindActionKey = `changeRequestKind:${itemId}:${nextRequestKind}`;
                  const canDeleteItem =
                    canManagePlaylist || isQueuedViewerRequest;
                  const canSetCurrent = canManagePlaylist && !isCurrent;
                  const canMarkPlayed = canManagePlaylist && isCurrent;
                  const canToggleVipRequest =
                    !!canManageVipRequests &&
                    !!getString(item, "requestedByLogin");
                  const confirmingRemove = confirmingRemoveItemId === itemId;

                  return (
                    <div
                      key={itemId}
                      className="border-t border-(--border) px-3 py-2"
                      style={
                        isViewerRequest
                          ? {
                              borderColor: "var(--viewer-highlight-border)",
                              backgroundColor: "var(--viewer-highlight-bg)",
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] leading-4 font-medium text-(--text)">
                            {formatSongLabel(item)}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] leading-4 text-(--muted)">
                            {formatRequesterLine(item)}
                          </p>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          ref={confirmingRemove ? removeConfirmRef : null}
                        >
                          {requestLabel ? (
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                isCurrent
                                  ? "text-(--brand-deep)"
                                  : "text-(--muted)"
                              }`}
                            >
                              {requestLabel}
                            </span>
                          ) : null}
                          {canToggleVipRequest ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-none px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                              onClick={() => {
                                void handlePlaylistMutation({
                                  action: "changeRequestKind",
                                  itemId,
                                  requestKind: nextRequestKind,
                                });
                              }}
                              disabled={
                                pendingAction === changeRequestKindActionKey
                              }
                              title={
                                isVipRequest
                                  ? "Change to regular request"
                                  : "Upgrade to VIP request"
                              }
                            >
                              {pendingAction === changeRequestKindActionKey
                                ? "..."
                                : isVipRequest
                                  ? "Reg"
                                  : "VIP"}
                            </Button>
                          ) : null}
                          {canSetCurrent ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                              onClick={() => {
                                void handlePlaylistMutation({
                                  action: "setCurrent",
                                  itemId,
                                });
                              }}
                              disabled={pendingAction === setCurrentActionKey}
                              title="Play now"
                              aria-label="Play now"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canMarkPlayed ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                              onClick={() => {
                                void handlePlaylistMutation({
                                  action: "markPlayed",
                                  itemId,
                                });
                              }}
                              disabled={pendingAction === markPlayedActionKey}
                              title="Mark played"
                              aria-label="Mark played"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {canDeleteItem ? (
                            confirmingRemove ? (
                              <div className="flex items-center gap-1 text-[10px] text-(--muted)">
                                <span>
                                  {canManagePlaylist ? "Delete?" : "Remove?"}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-none px-0 text-(--danger) shadow-none hover:bg-(--danger)/10 hover:text-(--danger)"
                                  onClick={() => {
                                    if (canManagePlaylist) {
                                      void handlePlaylistMutation({
                                        action: "deleteItem",
                                        itemId,
                                      });
                                      return;
                                    }

                                    void handleRemoveRequest(itemId);
                                  }}
                                  disabled={
                                    pendingAction === removeActionKey ||
                                    pendingAction === deleteActionKey
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                                  onClick={() =>
                                    setConfirmingRemoveItemId(null)
                                  }
                                  disabled={
                                    pendingAction === removeActionKey ||
                                    pendingAction === deleteActionKey
                                  }
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 rounded-none px-0 text-(--muted) shadow-none hover:bg-(--panel-soft) hover:text-(--text)"
                                onClick={() =>
                                  setConfirmingRemoveItemId(itemId)
                                }
                                title={
                                  canManagePlaylist
                                    ? "Delete playlist item"
                                    : "Remove request"
                                }
                                aria-label={
                                  canManagePlaylist
                                    ? "Delete playlist item"
                                    : "Remove request"
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )
                          ) : null}
                        </div>
                      </div>
                    </div>
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
    throw new Error(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "Extension request failed."
    );
  }

  return payload as T;
}

function getErrorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function getPlaylistMutationSuccessMessage(
  mutation:
    | { action: "setCurrent"; itemId: string }
    | { action: "markPlayed"; itemId: string }
    | { action: "deleteItem"; itemId: string }
    | {
        action: "changeRequestKind";
        itemId: string;
        requestKind: "regular" | "vip";
      },
  response: { error?: string; ok?: boolean }
) {
  if (typeof response?.error === "string" && response.error.trim()) {
    return response.error;
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

function formatRequestKind(item: Record<string, unknown>) {
  return getString(item, "requestKind") === "vip" ? "VIP" : null;
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
