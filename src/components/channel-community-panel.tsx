import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { getErrorMessage } from "~/lib/utils";
import {
  clampVipTokenCount,
  formatVipTokenCount,
  normalizeVipTokenCount,
} from "~/lib/vip-tokens";

type TwitchUserMatch = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
  isCurrentChatter?: boolean;
};

type TwitchUserSearchResponse = {
  users: TwitchUserMatch[];
  needsChatterScopeReconnect?: boolean;
  preferredSource?: "chatters" | "global";
};

type VipTokenRowData = {
  login: string;
  displayName?: string | null;
  availableCount: number;
};

const VIP_TOKEN_SAVE_DEBOUNCE_MS = 800;
const VIP_TOKEN_PAGE_SIZE = 10;
const SYNTHETIC_VIP_SEARCH_USER_ID_PREFIX = "vip-existing:";

export function ChannelCommunityPanel(props: {
  slug: string;
  canManageBlockedChatters: boolean;
  canViewVipTokens: boolean;
  canManageVipTokens: boolean;
  blocks: Array<{
    twitchUserId: string;
    login?: string | null;
    displayName?: string | null;
    reason?: string | null;
  }>;
  vipTokens: VipTokenRowData[];
}) {
  const queryClient = useQueryClient();
  const [blockedLookupQuery, setBlockedLookupQuery] = useState("");
  const [debouncedBlockedLookupQuery, setDebouncedBlockedLookupQuery] =
    useState("");
  const [vipLookupQuery, setVipLookupQuery] = useState("");
  const [debouncedVipLookupQuery, setDebouncedVipLookupQuery] = useState("");
  const [selectedBlockedUser, setSelectedBlockedUser] =
    useState<TwitchUserMatch | null>(null);
  const [selectedVipUser, setSelectedVipUser] =
    useState<TwitchUserMatch | null>(null);
  const [blockedLookupResults, setBlockedLookupResults] = useState<
    TwitchUserMatch[]
  >([]);
  const [vipLookupResults, setVipLookupResults] = useState<TwitchUserMatch[]>(
    []
  );
  const [
    needsBlockedChatterScopeReconnect,
    setNeedsBlockedChatterScopeReconnect,
  ] = useState(false);
  const [needsVipChatterScopeReconnect, setNeedsVipChatterScopeReconnect] =
    useState(false);
  const [blockedPreferredSource, setBlockedPreferredSource] = useState<
    "chatters" | "global"
  >("global");
  const [vipPreferredSource, setVipPreferredSource] = useState<
    "chatters" | "global"
  >("global");
  const [blockedSearchError, setBlockedSearchError] = useState<string | null>(
    null
  );
  const [vipSearchError, setVipSearchError] = useState<string | null>(null);
  const [vipTokenPage, setVipTokenPage] = useState(1);
  const [pendingVipFocusLogin, setPendingVipFocusLogin] = useState<
    string | null
  >(null);
  const [highlightedVipTokenLogin, setHighlightedVipTokenLogin] = useState<
    string | null
  >(null);
  const [vipTokenNotice, setVipTokenNotice] = useState<string | null>(null);
  const [vipTokenNoticeVisible, setVipTokenNoticeVisible] = useState(false);
  const normalizedVipLookupQuery = normalizeVipLookupValue(
    debouncedVipLookupQuery
  );

  const vipTokensByLogin = useMemo(
    () =>
      new Map(
        props.vipTokens.map((token) => [
          normalizeVipLookupValue(token.login),
          token,
        ])
      ),
    [props.vipTokens]
  );
  const prioritizedVipLookupResults = useMemo(
    () =>
      buildPrioritizedVipLookupResults({
        query: debouncedVipLookupQuery,
        results: vipLookupResults,
        vipTokens: props.vipTokens,
      }),
    [debouncedVipLookupQuery, props.vipTokens, vipLookupResults]
  );
  const totalVipTokenPages = Math.max(
    1,
    Math.ceil(props.vipTokens.length / VIP_TOKEN_PAGE_SIZE)
  );
  const paginatedVipTokens = useMemo(() => {
    const start = (vipTokenPage - 1) * VIP_TOKEN_PAGE_SIZE;
    return props.vipTokens.slice(start, start + VIP_TOKEN_PAGE_SIZE);
  }, [props.vipTokens, vipTokenPage]);
  const vipTokenRangeStart =
    props.vipTokens.length > 0
      ? (vipTokenPage - 1) * VIP_TOKEN_PAGE_SIZE + 1
      : 0;
  const vipTokenRangeEnd = Math.min(
    props.vipTokens.length,
    vipTokenPage * VIP_TOKEN_PAGE_SIZE
  );
  const shouldShowVipLookupResults =
    normalizedVipLookupQuery.length >= 4 ||
    prioritizedVipLookupResults.length > 0;
  const hasShortVipLookupQuery =
    normalizedVipLookupQuery.length > 0 && normalizedVipLookupQuery.length < 4;
  const hasLocalVipLookupMatches = prioritizedVipLookupResults.some((user) =>
    vipTokensByLogin.has(normalizeVipLookupValue(user.login))
  );

  async function handleGrantVipToken() {
    if (!selectedVipUser) {
      return;
    }

    const normalizedLogin = normalizeVipLookupValue(selectedVipUser.login);

    try {
      const payload: {
        action: "addVipToken";
        login: string;
        displayName?: string;
        twitchUserId?: string;
      } = {
        action: "addVipToken",
        login: selectedVipUser.login,
        displayName: selectedVipUser.displayName,
      };

      if (!isSyntheticVipLookupUserId(selectedVipUser.id)) {
        payload.twitchUserId = selectedVipUser.id;
      }

      await mutation.mutateAsync(payload);
      setPendingVipFocusLogin(normalizedLogin);
      setVipTokenNotice("Added 1 token");
    } catch {}
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedBlockedLookupQuery(
        blockedLookupQuery.trim().replace(/^@+/, "")
      );
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [blockedLookupQuery]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedVipLookupQuery(vipLookupQuery.trim().replace(/^@+/, ""));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [vipLookupQuery]);

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/channel/${props.slug}/moderation`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Unable to update channel community settings."
        );
      }

      return payload;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["channel-playlist", props.slug],
        }),
      ]);
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function runLookup() {
      if (
        debouncedBlockedLookupQuery.length < 4 ||
        !props.canManageBlockedChatters
      ) {
        setBlockedLookupResults([]);
        setBlockedSearchError(null);
        setNeedsBlockedChatterScopeReconnect(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          type: "twitch-user",
          query: debouncedBlockedLookupQuery,
        });
        const response = await fetch(
          `/api/channel/${props.slug}/moderation/search?${params}`
        );
        const payload = (await response.json().catch(() => null)) as
          | TwitchUserSearchResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload ? payload.error : undefined
          );
        }

        if (!cancelled) {
          const lookup = payload as TwitchUserSearchResponse;
          setBlockedLookupResults(lookup.users ?? []);
          setNeedsBlockedChatterScopeReconnect(
            lookup.needsChatterScopeReconnect ?? false
          );
          setBlockedPreferredSource(lookup.preferredSource ?? "global");
          setBlockedSearchError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setBlockedSearchError(
            getErrorMessage(error) || "User lookup failed."
          );
        }
      }
    }

    void runLookup();

    return () => {
      cancelled = true;
    };
  }, [debouncedBlockedLookupQuery, props.canManageBlockedChatters, props.slug]);

  useEffect(() => {
    let cancelled = false;

    async function runLookup() {
      if (debouncedVipLookupQuery.length < 4 || !props.canViewVipTokens) {
        setVipLookupResults([]);
        setVipSearchError(null);
        setNeedsVipChatterScopeReconnect(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          type: "twitch-user",
          query: debouncedVipLookupQuery,
        });
        const response = await fetch(
          `/api/channel/${props.slug}/moderation/search?${params}`
        );
        const payload = (await response.json().catch(() => null)) as
          | TwitchUserSearchResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload ? payload.error : undefined
          );
        }

        if (!cancelled) {
          const lookup = payload as TwitchUserSearchResponse;
          setVipLookupResults(lookup.users ?? []);
          setNeedsVipChatterScopeReconnect(
            lookup.needsChatterScopeReconnect ?? false
          );
          setVipPreferredSource(lookup.preferredSource ?? "global");
          setVipSearchError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setVipSearchError(getErrorMessage(error) || "User lookup failed.");
        }
      }
    }

    void runLookup();

    return () => {
      cancelled = true;
    };
  }, [debouncedVipLookupQuery, props.canViewVipTokens, props.slug]);

  useEffect(() => {
    setVipTokenPage((currentPage) => Math.min(currentPage, totalVipTokenPages));
  }, [totalVipTokenPages]);

  useEffect(() => {
    if (!pendingVipFocusLogin) {
      return;
    }

    const focusedIndex = props.vipTokens.findIndex(
      (token) => normalizeVipLookupValue(token.login) === pendingVipFocusLogin
    );

    if (focusedIndex === -1) {
      return;
    }

    setVipTokenPage(Math.floor(focusedIndex / VIP_TOKEN_PAGE_SIZE) + 1);
    setHighlightedVipTokenLogin(pendingVipFocusLogin);
    setPendingVipFocusLogin(null);
  }, [pendingVipFocusLogin, props.vipTokens]);

  useEffect(() => {
    if (!highlightedVipTokenLogin) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHighlightedVipTokenLogin((current) =>
        current === highlightedVipTokenLogin ? null : current
      );
    }, 1600);

    return () => window.clearTimeout(timeout);
  }, [highlightedVipTokenLogin]);

  useEffect(() => {
    if (!vipTokenNotice) {
      setVipTokenNoticeVisible(false);
      return;
    }

    setVipTokenNoticeVisible(true);
    const fadeTimeout = window.setTimeout(() => {
      setVipTokenNoticeVisible(false);
    }, 900);
    const clearTimeoutId = window.setTimeout(() => {
      setVipTokenNotice((current) =>
        current === vipTokenNotice ? null : current
      );
    }, 1250);

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, [vipTokenNotice]);

  if (!props.canManageBlockedChatters && !props.canViewVipTokens) {
    return null;
  }

  return (
    <section className="grid gap-6 max-[960px]:gap-4 max-[960px]:border-t max-[960px]:border-(--border) max-[960px]:pt-4">
      <div className="px-8 max-[960px]:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-(--text)">
          Moderator controls
        </h2>
      </div>

      {props.canManageBlockedChatters || props.canViewVipTokens ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] max-[960px]:gap-0">
          {props.canManageBlockedChatters ? (
            <Card className="max-[960px]:rounded-none max-[960px]:border-x-0 max-[960px]:bg-transparent max-[960px]:shadow-none max-[960px]:[background-image:none]">
              <CardHeader className="max-[960px]:px-0">
                <CardTitle>Blocked viewers</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 max-[960px]:px-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={blockedLookupQuery}
                    onChange={(event) => {
                      setBlockedLookupQuery(event.target.value);
                      setSelectedBlockedUser(null);
                    }}
                    placeholder="Search Twitch username to block"
                    className="min-w-[16rem] flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (!selectedBlockedUser) {
                        return;
                      }

                      mutation.mutate({
                        action: "blockUser",
                        twitchUserId: selectedBlockedUser.id,
                        login: selectedBlockedUser.login,
                        displayName: selectedBlockedUser.displayName,
                        reason: "Blocked from making requests in this channel.",
                      });
                    }}
                    disabled={mutation.isPending || !selectedBlockedUser}
                    className="max-[520px]:w-full"
                  >
                    Block viewer
                  </Button>
                </div>
                {blockedLookupQuery.trim().replace(/^@+/, "").length > 0 &&
                blockedLookupQuery.trim().replace(/^@+/, "").length < 4 ? (
                  <p className="text-sm text-(--muted)">
                    Type at least 4 characters to search Twitch usernames.
                  </p>
                ) : null}
                {needsBlockedChatterScopeReconnect ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-sm text-amber-100">
                      Reconnect Twitch to prioritize viewers currently in chat.
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/auth/twitch/start?redirectTo=${encodeURIComponent(`/${props.slug}`)}`}
                      >
                        Reconnect Twitch
                      </a>
                    </Button>
                  </div>
                ) : null}
                {blockedSearchError ? (
                  <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {blockedSearchError}
                  </div>
                ) : null}
                {debouncedBlockedLookupQuery.length >= 4 ? (
                  <div className="overflow-hidden border border-(--border)">
                    {blockedLookupResults.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between gap-3 border-b border-(--border) bg-(--panel) px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                            {blockedPreferredSource === "chatters"
                              ? "Current chatters first"
                              : "Twitch matches"}
                          </p>
                          <Badge variant="outline">
                            {blockedLookupResults.length} result
                            {blockedLookupResults.length === 1 ? "" : "s"}
                          </Badge>
                        </div>
                        {blockedLookupResults.map((user, index) => {
                          const isBlockedSelected =
                            selectedBlockedUser?.id === user.id;

                          return (
                            <button
                              key={user.id}
                              type="button"
                              className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:border-(--brand) ${
                                user.isCurrentChatter
                                  ? "bg-emerald-500/10"
                                  : index % 2 === 0
                                    ? "bg-(--panel-soft)"
                                    : "bg-(--panel-muted)"
                              } ${index > 0 ? "border-t border-(--border)" : ""}`}
                              onClick={() => {
                                setBlockedLookupQuery(user.login);
                                setSelectedBlockedUser(user);
                              }}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-(--text)">
                                  {user.displayName}
                                </p>
                                <p className="truncate text-sm text-(--muted)">
                                  @{user.login} · Twitch ID {user.id}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {user.isCurrentChatter ? (
                                  <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
                                    In chat
                                  </Badge>
                                ) : null}
                                {isBlockedSelected ? (
                                  <Badge variant="outline">Selected</Badge>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-4 py-3 text-sm text-(--muted)">
                        No matching Twitch usernames.
                      </p>
                    )}
                  </div>
                ) : null}
                <p className="text-sm text-(--muted)">
                  Blocked viewers can still talk in Twitch chat, but they cannot
                  add or edit requests from chat, the website, or the extension
                  panel.
                </p>
                {props.blocks.length > 0 ? (
                  <div className="overflow-hidden border border-(--border)">
                    {props.blocks.map((block, index) => (
                      <div
                        key={block.twitchUserId}
                        className={`flex items-start justify-between gap-4 px-5 py-4 ${
                          index % 2 === 0
                            ? "bg-(--panel-soft)"
                            : "bg-(--panel-muted)"
                        } ${index > 0 ? "border-t border-(--border)" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-(--text)">
                            {block.displayName ??
                              (block.login
                                ? `@${block.login}`
                                : block.twitchUserId)}
                          </p>
                          <p className="truncate text-sm text-(--muted)">
                            {block.login
                              ? `@${block.login}`
                              : block.twitchUserId}
                          </p>
                          <p className="text-sm text-(--muted)">
                            {block.reason ??
                              "Blocked from making requests in this channel."}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutation.mutate({
                              action: "removeBlockedUser",
                              twitchUserId: block.twitchUserId,
                            })
                          }
                          disabled={mutation.isPending}
                        >
                          Unblock
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-(--muted)">No blocked viewers.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {props.canViewVipTokens ? (
            <Card className="max-[960px]:rounded-none max-[960px]:border-x-0 max-[960px]:bg-transparent max-[960px]:shadow-none max-[960px]:[background-image:none]">
              <CardHeader className="max-[960px]:px-0">
                <CardTitle>VIP tokens</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 max-[960px]:px-0">
                {props.canManageVipTokens ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <Input
                        value={vipLookupQuery}
                        onChange={(event) => {
                          setVipLookupQuery(event.target.value);
                          setSelectedVipUser(null);
                        }}
                        placeholder="Search Twitch username to grant a token"
                        className="min-w-[16rem] flex-1"
                      />
                      <Button
                        onClick={() => {
                          void handleGrantVipToken();
                        }}
                        disabled={mutation.isPending || !selectedVipUser}
                        className="max-[520px]:w-full"
                      >
                        Grant token
                      </Button>
                    </div>
                    {hasShortVipLookupQuery ? (
                      <p className="text-sm text-(--muted)">
                        {hasLocalVipLookupMatches
                          ? "Existing VIP token holders appear below. Type at least 4 characters to search all Twitch usernames."
                          : "Type at least 4 characters to search Twitch usernames."}
                      </p>
                    ) : null}
                    {needsVipChatterScopeReconnect ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                        <p className="text-sm text-amber-100">
                          Reconnect Twitch to prioritize viewers currently in
                          chat.
                        </p>
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={`/auth/twitch/start?redirectTo=${encodeURIComponent(`/${props.slug}`)}`}
                          >
                            Reconnect Twitch
                          </a>
                        </Button>
                      </div>
                    ) : null}
                    {vipSearchError ? (
                      <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {vipSearchError}
                      </div>
                    ) : null}
                    {shouldShowVipLookupResults ? (
                      <div className="overflow-hidden border border-(--border)">
                        {prioritizedVipLookupResults.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between gap-3 border-b border-(--border) bg-(--panel) px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                                {hasShortVipLookupQuery &&
                                hasLocalVipLookupMatches
                                  ? "VIP token holders first"
                                  : vipPreferredSource === "chatters"
                                    ? "Current chatters first"
                                    : "Twitch matches"}
                              </p>
                              <Badge variant="outline">
                                {prioritizedVipLookupResults.length} result
                                {prioritizedVipLookupResults.length === 1
                                  ? ""
                                  : "s"}
                              </Badge>
                            </div>
                            {prioritizedVipLookupResults.map((user, index) => {
                              const normalizedUserLogin =
                                normalizeVipLookupValue(user.login);
                              const existingVipToken =
                                vipTokensByLogin.get(normalizedUserLogin);
                              const isVipSelected =
                                normalizeVipLookupValue(
                                  selectedVipUser?.login ?? ""
                                ) === normalizedUserLogin;

                              return (
                                <button
                                  key={user.id}
                                  type="button"
                                  className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:border-(--brand) ${
                                    user.isCurrentChatter
                                      ? "bg-emerald-500/10"
                                      : index % 2 === 0
                                        ? "bg-(--panel-soft)"
                                        : "bg-(--panel-muted)"
                                  } ${index > 0 ? "border-t border-(--border)" : ""}`}
                                  onClick={() => {
                                    setVipLookupQuery(user.login);
                                    setSelectedVipUser(user);
                                  }}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-(--text)">
                                      {user.displayName}
                                    </p>
                                    <p className="truncate text-sm text-(--muted)">
                                      @{user.login} · Twitch ID {user.id}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {existingVipToken ? (
                                      <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-100">
                                        {formatVipTokenCount(
                                          existingVipToken.availableCount
                                        )}{" "}
                                        token
                                        {existingVipToken.availableCount === 1
                                          ? ""
                                          : "s"}
                                      </Badge>
                                    ) : null}
                                    {user.isCurrentChatter ? (
                                      <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200">
                                        In chat
                                      </Badge>
                                    ) : null}
                                    {isVipSelected ? (
                                      <Badge variant="outline">Selected</Badge>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="px-4 py-3 text-sm text-(--muted)">
                            No matching Twitch usernames.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-(--muted)">
                    You can view VIP balances, but only the broadcaster or an
                    allowed moderator can change them.
                  </p>
                )}
                <div className="min-h-5" aria-live="polite" role="status">
                  {vipTokenNotice ? (
                    <p
                      className={`text-sm text-emerald-300 transition-opacity duration-300 ${
                        vipTokenNoticeVisible ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {vipTokenNotice}
                    </p>
                  ) : null}
                </div>
                <div className="overflow-hidden border border-(--border) bg-(--panel-soft)">
                  {props.vipTokens.length > 0 ? (
                    <>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-(--border) bg-(--panel)">
                            <th className="px-4 py-3 text-left font-semibold text-(--muted)">
                              Username
                            </th>
                            <th className="px-4 py-3 text-left font-semibold text-(--muted)">
                              Tokens
                            </th>
                            <th className="w-12 px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedVipTokens.map((token) => (
                            <VipTokenRow
                              key={token.login}
                              token={token}
                              canManage={props.canManageVipTokens}
                              isHighlighted={
                                highlightedVipTokenLogin ===
                                normalizeVipLookupValue(token.login)
                              }
                              onShowNotice={setVipTokenNotice}
                              onSave={async (input) => {
                                await mutation.mutateAsync({
                                  action: "setVipTokenCount",
                                  login: input.login,
                                  count: input.count,
                                });
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
                      {props.vipTokens.length > VIP_TOKEN_PAGE_SIZE ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border) bg-(--panel) px-4 py-3">
                          <p className="text-sm text-(--muted)">
                            Showing {vipTokenRangeStart}-{vipTokenRangeEnd} of{" "}
                            {props.vipTokens.length}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setVipTokenPage((current) =>
                                  Math.max(1, current - 1)
                                )
                              }
                              disabled={vipTokenPage === 1}
                            >
                              Previous
                            </Button>
                            <Badge variant="outline">
                              Page {vipTokenPage} of {totalVipTokenPages}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setVipTokenPage((current) =>
                                  Math.min(totalVipTokenPages, current + 1)
                                )
                              }
                              disabled={vipTokenPage === totalVipTokenPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="px-4 py-3 text-sm text-(--muted)">
                      No VIP tokens yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {mutation.error ? (
        <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {getErrorMessage(mutation.error)}
        </div>
      ) : null}
    </section>
  );
}

function VipTokenRow(props: {
  token: VipTokenRowData;
  canManage: boolean;
  isHighlighted?: boolean;
  onShowNotice(message: string): void;
  onSave(input: { login: string; count: number }): Promise<void>;
}) {
  const [draftCount, setDraftCount] = useState(
    formatVipTokenCount(props.token.availableCount)
  );
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "queued" | "saving" | "saved" | "error"
  >("idle");
  const controlsLocked = !props.canManage || saveState === "saving";

  useEffect(() => {
    if (saveState === "queued" || saveState === "saving") {
      return;
    }

    setDraftCount(formatVipTokenCount(props.token.availableCount));
    setHasLocalEdits(false);
  }, [props.token.availableCount, saveState]);

  useEffect(() => {
    if (!props.canManage || !hasLocalEdits) {
      return;
    }

    const parsed = Number.parseFloat(draftCount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const normalizedCount = clampVipTokenCount(parsed);
    if (normalizedCount === props.token.availableCount) {
      setSaveState((current) =>
        current === "queued" || current === "saving" ? current : "idle"
      );
      return;
    }

    setSaveState("queued");
    const timeout = window.setTimeout(async () => {
      try {
        const delta = normalizeVipTokenCount(
          normalizedCount - props.token.availableCount
        );
        setSaveState("saving");
        await props.onSave({
          login: props.token.login,
          count: normalizedCount,
        });
        setDraftCount(formatVipTokenCount(normalizedCount));
        setHasLocalEdits(false);
        setSaveState("saved");
        if (delta !== 0) {
          props.onShowNotice(formatVipTokenDeltaNotice(delta));
        }
        window.setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current));
        }, 1200);
      } catch {
        setSaveState("error");
      }
    }, VIP_TOKEN_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    draftCount,
    hasLocalEdits,
    props.canManage,
    props.onShowNotice,
    props.onSave,
    props.token.availableCount,
    props.token.login,
  ]);

  return (
    <tr
      className={`border-b border-(--border) transition-colors last:border-b-0 ${
        props.isHighlighted ? "bg-sky-500/10" : ""
      }`}
    >
      <td className="px-4 py-3 font-medium text-(--text)">
        @{props.token.login}
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-[200px] items-center gap-2">
          <button
            type="button"
            className="border border-(--border) p-2 text-(--muted) transition hover:border-(--brand) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--border) disabled:hover:text-(--muted)"
            onClick={() => {
              setHasLocalEdits(true);
              setDraftCount((current) =>
                formatVipTokenCount(
                  Math.max(
                    0,
                    clampVipTokenCount(Number.parseFloat(current || "0")) - 1
                  )
                )
              );
            }}
            disabled={controlsLocked}
          >
            <Minus className="h-4 w-4" />
          </button>
          <Input
            value={draftCount}
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{0,2})?"
            className="h-10 bg-background px-3 py-2 text-center"
            disabled={controlsLocked}
            readOnly={!props.canManage}
            onChange={(event) => {
              const rawValue = event.target.value.replace(/[^0-9.]/g, "");
              const [wholePart, ...decimalParts] = rawValue.split(".");
              const decimalPart = decimalParts.join("").slice(0, 2);
              const next =
                decimalParts.length > 0
                  ? `${wholePart}.${decimalPart}`
                  : wholePart;
              setHasLocalEdits(true);
              setDraftCount(next);
            }}
            onBlur={() => {
              if (draftCount.trim() === "") {
                setDraftCount(formatVipTokenCount(props.token.availableCount));
                setHasLocalEdits(false);
                setSaveState("idle");
                return;
              }

              const parsed = Number.parseFloat(draftCount);
              if (!Number.isFinite(parsed)) {
                setDraftCount(formatVipTokenCount(props.token.availableCount));
                setHasLocalEdits(false);
                setSaveState("idle");
                return;
              }

              setDraftCount(formatVipTokenCount(parsed));
            }}
          />
          <button
            type="button"
            className="border border-(--border) p-2 text-(--muted) transition hover:border-(--brand) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--border) disabled:hover:text-(--muted)"
            onClick={() => {
              setHasLocalEdits(true);
              setDraftCount((current) =>
                formatVipTokenCount(
                  clampVipTokenCount(Number.parseFloat(current || "0")) + 1
                )
              );
            }}
            disabled={controlsLocked}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {saveState === "saved" ? (
          <span className="inline-flex items-center text-emerald-300">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function normalizeVipLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function isSyntheticVipLookupUserId(id: string) {
  return id.startsWith(SYNTHETIC_VIP_SEARCH_USER_ID_PREFIX);
}

function vipTokenMatchesLookupQuery(token: VipTokenRowData, query: string) {
  const normalizedQuery = normalizeVipLookupValue(query);
  if (!normalizedQuery) {
    return false;
  }

  return (
    normalizeVipLookupValue(token.login).includes(normalizedQuery) ||
    normalizeVipLookupValue(token.displayName).includes(normalizedQuery)
  );
}

function buildPrioritizedVipLookupResults(input: {
  query: string;
  results: TwitchUserMatch[];
  vipTokens: VipTokenRowData[];
}) {
  const normalizedQuery = normalizeVipLookupValue(input.query);
  if (!normalizedQuery) {
    return [];
  }

  const vipTokensByLogin = new Map(
    input.vipTokens.map((token) => [
      normalizeVipLookupValue(token.login),
      token,
    ])
  );
  const mergedResults = new Map<string, TwitchUserMatch>();

  for (const result of input.results) {
    const normalizedLogin = normalizeVipLookupValue(result.login);
    if (!normalizedLogin) {
      continue;
    }

    mergedResults.set(normalizedLogin, result);
  }

  for (const token of input.vipTokens) {
    const normalizedLogin = normalizeVipLookupValue(token.login);
    if (!normalizedLogin || mergedResults.has(normalizedLogin)) {
      continue;
    }

    if (!vipTokenMatchesLookupQuery(token, normalizedQuery)) {
      continue;
    }

    mergedResults.set(normalizedLogin, {
      id: `${SYNTHETIC_VIP_SEARCH_USER_ID_PREFIX}${normalizedLogin}`,
      login: token.login,
      displayName: token.displayName ?? token.login,
    });
  }

  return [...mergedResults.values()].sort((left, right) => {
    const leftLogin = normalizeVipLookupValue(left.login);
    const rightLogin = normalizeVipLookupValue(right.login);
    const leftDisplayName = normalizeVipLookupValue(left.displayName);
    const rightDisplayName = normalizeVipLookupValue(right.displayName);
    const leftHasVipTokens = vipTokensByLogin.has(leftLogin);
    const rightHasVipTokens = vipTokensByLogin.has(rightLogin);

    if (leftHasVipTokens !== rightHasVipTokens) {
      return leftHasVipTokens ? -1 : 1;
    }

    const leftStartsWithQuery =
      leftLogin.startsWith(normalizedQuery) ||
      leftDisplayName.startsWith(normalizedQuery);
    const rightStartsWithQuery =
      rightLogin.startsWith(normalizedQuery) ||
      rightDisplayName.startsWith(normalizedQuery);
    if (leftStartsWithQuery !== rightStartsWithQuery) {
      return leftStartsWithQuery ? -1 : 1;
    }

    if (!!left.isCurrentChatter !== !!right.isCurrentChatter) {
      return left.isCurrentChatter ? -1 : 1;
    }

    return (left.displayName || left.login).localeCompare(
      right.displayName || right.login,
      undefined,
      { sensitivity: "base" }
    );
  });
}

function formatVipTokenDeltaNotice(delta: number) {
  const normalizedDelta = normalizeVipTokenCount(delta);
  const formattedDelta = formatVipTokenCount(Math.abs(normalizedDelta));
  const tokenLabel = formattedDelta === "1" ? "VIP token" : "VIP tokens";

  if (normalizedDelta > 0) {
    return `Added ${formattedDelta} ${tokenLabel}`;
  }

  if (normalizedDelta < 0) {
    return `Removed ${formattedDelta} ${tokenLabel}`;
  }

  return "Saved VIP tokens";
}
