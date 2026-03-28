import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { getErrorMessage } from "~/lib/utils";
import { clampVipTokenCount, formatVipTokenCount } from "~/lib/vip-tokens";

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

  if (!props.canManageBlockedChatters && !props.canViewVipTokens) {
    return null;
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-(--text)">
          Community controls
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-(--muted)">
          Manage blocked viewers and VIP token balances directly on the channel
          page when your role allows it.
        </p>
      </div>

      {props.canManageBlockedChatters || props.canViewVipTokens ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {props.canManageBlockedChatters ? (
            <Card>
              <CardHeader>
                <CardTitle>Blocked viewers</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input
                  value={blockedLookupQuery}
                  onChange={(event) => {
                    setBlockedLookupQuery(event.target.value);
                    setSelectedBlockedUser(null);
                  }}
                  placeholder="Search Twitch username to block"
                />
                {blockedLookupQuery.trim().replace(/^@+/, "").length > 0 &&
                blockedLookupQuery.trim().replace(/^@+/, "").length < 4 ? (
                  <p className="text-sm text-(--muted)">
                    Type at least 4 characters to search Twitch usernames.
                  </p>
                ) : null}
                {needsBlockedChatterScopeReconnect ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
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
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {blockedSearchError}
                  </div>
                ) : null}
                {debouncedBlockedLookupQuery.length >= 4 ? (
                  <div className="rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3">
                    {blockedLookupResults.length > 0 ? (
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
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
                        {blockedLookupResults.map((user) => {
                          const isBlockedSelected =
                            selectedBlockedUser?.id === user.id;

                          return (
                            <button
                              key={user.id}
                              type="button"
                              className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-2 text-left transition hover:border-(--brand) ${
                                user.isCurrentChatter
                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                  : "border-(--border) bg-background"
                              }`}
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
                      <p className="text-sm text-(--muted)">
                        No matching Twitch usernames.
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
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
                  >
                    Block selected viewer
                  </Button>
                </div>
                <p className="text-sm text-(--muted)">
                  Blocked viewers can still talk in Twitch chat, but they cannot
                  add or edit requests from chat, the website, or the extension
                  panel.
                </p>
                {props.blocks.length > 0 ? (
                  <div className="grid gap-3">
                    {props.blocks.map((block) => (
                      <div
                        key={block.twitchUserId}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-5 py-4"
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
            <Card>
              <CardHeader>
                <CardTitle>VIP tokens</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {props.canManageVipTokens ? (
                  <>
                    <Input
                      value={vipLookupQuery}
                      onChange={(event) => {
                        setVipLookupQuery(event.target.value);
                        setSelectedVipUser(null);
                      }}
                      placeholder="Search Twitch username to grant a token"
                    />
                    {vipLookupQuery.trim().replace(/^@+/, "").length > 0 &&
                    vipLookupQuery.trim().replace(/^@+/, "").length < 4 ? (
                      <p className="text-sm text-(--muted)">
                        Type at least 4 characters to search Twitch usernames.
                      </p>
                    ) : null}
                    {needsVipChatterScopeReconnect ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
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
                      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {vipSearchError}
                      </div>
                    ) : null}
                    {debouncedVipLookupQuery.length >= 4 ? (
                      <div className="rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3">
                        {vipLookupResults.length > 0 ? (
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                                {vipPreferredSource === "chatters"
                                  ? "Current chatters first"
                                  : "Twitch matches"}
                              </p>
                              <Badge variant="outline">
                                {vipLookupResults.length} result
                                {vipLookupResults.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                            {vipLookupResults.map((user) => {
                              const isVipSelected =
                                selectedVipUser?.id === user.id;

                              return (
                                <button
                                  key={user.id}
                                  type="button"
                                  className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-2 text-left transition hover:border-(--brand) ${
                                    user.isCurrentChatter
                                      ? "border-emerald-500/40 bg-emerald-500/10"
                                      : "border-(--border) bg-background"
                                  }`}
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
                          <p className="text-sm text-(--muted)">
                            No matching Twitch usernames.
                          </p>
                        )}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => {
                          if (!selectedVipUser) {
                            return;
                          }

                          mutation.mutate({
                            action: "addVipToken",
                            login: selectedVipUser.login,
                            displayName: selectedVipUser.displayName,
                            twitchUserId: selectedVipUser.id,
                          });
                        }}
                        disabled={mutation.isPending || !selectedVipUser}
                      >
                        Grant token to selected chatter
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-(--muted)">
                    You can view VIP balances, but only the broadcaster or an
                    allowed moderator can change them.
                  </p>
                )}
                <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--panel-soft)">
                  {props.vipTokens.length > 0 ? (
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
                        {props.vipTokens.map((token) => (
                          <VipTokenRow
                            key={token.login}
                            token={token}
                            canManage={props.canManageVipTokens}
                            onSave={async (input) => {
                              mutation.mutate({
                                action: "setVipTokenCount",
                                login: input.login,
                                count: input.count,
                              });
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
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
        <div className="rounded-[24px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {getErrorMessage(mutation.error)}
        </div>
      ) : null}
    </section>
  );
}

function VipTokenRow(props: {
  token: VipTokenRowData;
  canManage: boolean;
  onSave(input: { login: string; count: number }): void;
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
        setSaveState("saving");
        await props.onSave({
          login: props.token.login,
          count: normalizedCount,
        });
        setDraftCount(formatVipTokenCount(normalizedCount));
        setHasLocalEdits(false);
        setSaveState("saved");
        window.setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current));
        }, 1200);
      } catch {
        setSaveState("error");
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    draftCount,
    hasLocalEdits,
    props.canManage,
    props.onSave,
    props.token.availableCount,
    props.token.login,
  ]);

  return (
    <tr className="border-b border-(--border) last:border-b-0">
      <td className="px-4 py-3 font-medium text-(--text)">
        @{props.token.login}
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-[200px] items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-(--border) p-2 text-(--muted) transition hover:border-(--brand) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--border) disabled:hover:text-(--muted)"
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
            className="h-10 rounded-xl bg-background px-3 py-2 text-center"
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
            className="rounded-full border border-(--border) p-2 text-(--muted) transition hover:border-(--brand) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--border) disabled:hover:text-(--muted)"
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
