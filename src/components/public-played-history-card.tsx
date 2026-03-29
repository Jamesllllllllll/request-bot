import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, History, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { usePaginatedContentTransition } from "~/lib/paginated-content-transition";
import { decodeHtmlEntities } from "~/lib/utils";

type PublicPlayedSong = {
  id: string;
  songTitle: string;
  songArtist?: string | null;
  requestedByDisplayName?: string | null;
  requestedByLogin?: string | null;
  playedAt: number;
};

type PublicPlayedHistoryResponse = {
  results: PublicPlayedSong[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

type PlayedHistoryRequester = {
  requesterId: string;
  requesterLogin?: string | null;
  requesterDisplayName?: string | null;
  requestCount: number;
};

type PlayedHistoryRequesterResponse = {
  results: PlayedHistoryRequester[];
};

export function PublicPlayedHistoryCard(props: {
  slug: string;
  channelDisplayName?: string | null;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [requesterInput, setRequesterInput] = useState("");
  const [debouncedRequesterInput, setDebouncedRequesterInput] = useState("");
  const [selectedRequester, setSelectedRequester] =
    useState<PlayedHistoryRequester | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setDebouncedRequesterInput(requesterInput.trim());
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [requesterInput, searchQuery]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedSearchQuery, selectedRequester?.requesterId]);

  const playedHistoryQuery = useQuery<PublicPlayedHistoryResponse>({
    queryKey: [
      "public-played-history",
      props.slug,
      historyPage,
      debouncedSearchQuery,
      selectedRequester?.requesterId ?? null,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(historyPage),
        pageSize: "20",
      });

      if (debouncedSearchQuery) {
        params.set("query", debouncedSearchQuery);
      }

      if (selectedRequester?.requesterId) {
        params.set("requesterId", selectedRequester.requesterId);
      }

      const response = await fetch(
        `/api/channel/${props.slug}/played?${params.toString()}`
      );
      return response.json() as Promise<PublicPlayedHistoryResponse>;
    },
    enabled: historyOpen,
    placeholderData: keepPreviousData,
  });

  const requesterResultsQuery = useQuery<PlayedHistoryRequesterResponse>({
    queryKey: [
      "played-history-requesters",
      props.slug,
      debouncedRequesterInput,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        query: debouncedRequesterInput,
      });
      const response = await fetch(
        `/api/channel/${props.slug}/played/requesters?${params.toString()}`
      );
      return response.json() as Promise<PlayedHistoryRequesterResponse>;
    },
    enabled:
      historyOpen &&
      !selectedRequester &&
      debouncedRequesterInput.trim().length >= 2,
  });

  const hasFilters = Boolean(
    debouncedSearchQuery || selectedRequester?.requesterId
  );
  const requesterResults = requesterResultsQuery.data?.results ?? [];
  const showRequesterResults = useMemo(
    () =>
      historyOpen &&
      !selectedRequester &&
      debouncedRequesterInput.trim().length >= 2 &&
      requesterResults.length > 0,
    [
      debouncedRequesterInput,
      historyOpen,
      requesterResults.length,
      selectedRequester,
    ]
  );
  const {
    goToPage: goToHistoryPage,
    isTransitioning: isHistoryTransitioning,
    transitionClassName: historyTransitionClassName,
  } = usePaginatedContentTransition({
    currentPage: historyPage,
    isFetching: playedHistoryQuery.isFetching,
    onPageChange: (nextPage) => setHistoryPage(nextPage),
  });

  return (
    <Card className="max-[960px]:rounded-none max-[960px]:border-x-0 max-[960px]:bg-transparent max-[960px]:shadow-none max-[960px]:[background-image:none]">
      <CardHeader className="flex flex-row items-center justify-between gap-4 max-[960px]:px-0">
        <div className="flex items-center gap-3">
          <div className="border border-(--border) bg-(--panel-soft) p-2 text-(--brand)">
            <History className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>
              {props.channelDisplayName
                ? `${props.channelDisplayName}'s played history`
                : "Played history"}
            </CardTitle>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setHistoryOpen((current) => !current)}
        >
          {historyOpen ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide history
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show history
            </>
          )}
        </Button>
      </CardHeader>
      {historyOpen ? (
        <CardContent className="grid gap-4 max-[960px]:px-0">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)"
                htmlFor={`played-history-search-${props.slug}`}
              >
                Song Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--muted)" />
                <Input
                  id={`played-history-search-${props.slug}`}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Song, artist, album, or charter"
                  className="pr-10 pl-10!"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-(--muted) transition-colors hover:text-(--text)"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)"
                htmlFor={`played-history-requester-${props.slug}`}
              >
                Requester
              </label>
              <div className="relative">
                <Input
                  id={`played-history-requester-${props.slug}`}
                  value={requesterInput}
                  onChange={(event) => {
                    setRequesterInput(event.target.value);
                    setSelectedRequester(null);
                  }}
                  placeholder="Search a requester"
                />
                {requesterInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRequesterInput("");
                      setSelectedRequester(null);
                    }}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-(--muted) transition-colors hover:text-(--text)"
                    aria-label="Clear requester"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {selectedRequester ? (
                <div className="inline-flex w-fit items-center gap-2 border border-(--border) bg-(--panel-soft) px-3 py-1.5 text-sm text-(--text)">
                  <span>
                    {formatRequesterLabel(selectedRequester)}
                    {selectedRequester.requestCount
                      ? ` · ${selectedRequester.requestCount} request${selectedRequester.requestCount === 1 ? "" : "s"}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequester(null);
                      setRequesterInput("");
                    }}
                    className="text-(--muted) transition-colors hover:text-(--text)"
                    aria-label="Clear requester filter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              {showRequesterResults ? (
                <div className="max-h-60 overflow-y-auto border border-(--border)">
                  {requesterResults.map((requester, index) => (
                    <button
                      key={requester.requesterId}
                      type="button"
                      onClick={() => {
                        setSelectedRequester(requester);
                        setRequesterInput(formatRequesterLabel(requester));
                      }}
                      className={`grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-(--panel-strong) ${
                        index > 0 ? "border-t border-(--border)" : ""
                      }`}
                    >
                      <span className="font-medium text-(--text)">
                        {formatRequesterLabel(requester)}
                      </span>
                      <span className="text-sm text-(--muted)">
                        {requester.requestCount} request
                        {requester.requestCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : requesterResultsQuery.isLoading ? (
                <p className="text-sm text-(--muted)">
                  Searching requesters...
                </p>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden">
            <div
              className={`paginated-transition-frame ${historyTransitionClassName}`.trim()}
            >
              {playedHistoryQuery.isLoading ? (
                <p className="text-sm text-(--muted)">
                  Loading played history...
                </p>
              ) : null}

              {!playedHistoryQuery.isLoading &&
              (playedHistoryQuery.data?.results.length ?? 0) === 0 ? (
                <p className="text-sm text-(--muted)">
                  {hasFilters
                    ? "No played songs matched those filters."
                    : "No songs have been marked played yet."}
                </p>
              ) : null}

              {playedHistoryQuery.data?.results.length ? (
                <div className="overflow-hidden border border-(--border)">
                  {playedHistoryQuery.data.results.map((song, index) => (
                    <div
                      key={song.id}
                      className={`px-4 py-3 ${
                        index % 2 === 0
                          ? "bg-(--panel-soft)"
                          : "bg-(--panel-muted)"
                      } ${index > 0 ? "border-t border-(--border)" : ""}`}
                    >
                      <p className="font-medium text-(--text)">
                        {decodeHtmlEntities(song.songTitle)}
                        {song.songArtist
                          ? ` by ${decodeHtmlEntities(song.songArtist)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-sm text-(--muted)">
                        {(song.requestedByDisplayName ?? song.requestedByLogin)
                          ? `Requested by ${song.requestedByDisplayName ?? song.requestedByLogin} · `
                          : ""}
                        {new Date(song.playedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {playedHistoryQuery.data &&
          ((playedHistoryQuery.data.page ?? 1) > 1 ||
            playedHistoryQuery.data.hasNextPage) ? (
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <p className="text-sm text-(--muted)">
                Page {playedHistoryQuery.data.page}
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        goToHistoryPage(
                          Math.max(1, (playedHistoryQuery.data?.page ?? 1) - 1)
                        )
                      }
                      disabled={
                        (playedHistoryQuery.data.page ?? 1) <= 1 ||
                        isHistoryTransitioning
                      }
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        goToHistoryPage(
                          (playedHistoryQuery.data?.page ?? 1) + 1
                        )
                      }
                      disabled={
                        !playedHistoryQuery.data.hasNextPage ||
                        isHistoryTransitioning
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function formatRequesterLabel(requester: PlayedHistoryRequester) {
  return (
    requester.requesterDisplayName ?? requester.requesterLogin ?? "Unknown"
  );
}
