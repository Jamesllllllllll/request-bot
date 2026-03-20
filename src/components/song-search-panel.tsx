import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Fragment, startTransition, useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { pathOptions } from "~/lib/channel-options";
import { formatPathLabel } from "~/lib/request-policy";
import { cn, getErrorMessage } from "~/lib/utils";

type SearchField = "any" | "title" | "artist" | "album" | "creator";
type SearchSort =
  | "relevance"
  | "artist"
  | "title"
  | "album"
  | "creator"
  | "tuning"
  | "duration"
  | "downloads"
  | "updated";

export interface SearchSong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
  durationText?: string;
  year?: number;
  downloads?: number;
  sourceId?: number;
  source: string;
}

type SearchResponse = {
  results: Array<
    SearchSong & {
      sourceUrl?: string;
    }
  >;
  total: number;
  page: number;
  pageSize: number;
  hasNextPage?: boolean;
};

type SearchFilterOptionsResponse = {
  tunings: string[];
  years: number[];
};

export function buildRequestCommand(song: SearchSong) {
  if (song.sourceId != null) {
    return `!sr song:${song.sourceId}`;
  }

  const fragments = [song.artist, song.title].filter(Boolean);
  return `!sr ${fragments.join(" - ")}`.trim();
}

export function SongSearchPanel(props: {
  title: string;
  eyebrow?: string;
  description?: string;
  infoNote?: string;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [field, setField] = useState<SearchField>("any");
  const [sortBy, setSortBy] = useState<SearchSort>("relevance");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedSongId, setCopiedSongId] = useState<string | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState({
    title: "",
    artist: "",
    album: "",
    creator: "",
    tuning: [] as string[],
    parts: [] as string[],
    year: [] as number[],
  });
  const [debouncedAdvancedFilters, setDebouncedAdvancedFilters] =
    useState(advancedFilters);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query);
      setDebouncedAdvancedFilters(advancedFilters);
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [advancedFilters, query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedAdvancedFilters, debouncedQuery, field, sortBy, sortDirection]);

  const searchParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "25",
      field,
      sortBy,
      sortDirection,
    });

    if (debouncedQuery.trim()) {
      params.set("query", debouncedQuery.trim());
    }

    for (const [key, value] of Object.entries(debouncedAdvancedFilters)) {
      if (Array.isArray(value)) {
        for (const part of value) {
          params.append(key, String(part));
        }
        continue;
      }

      if (value.trim()) {
        params.set(key, value.trim());
      }
    }

    return params;
  }, [
    debouncedAdvancedFilters,
    debouncedQuery,
    field,
    page,
    sortBy,
    sortDirection,
  ]);

  const hasSearchInput = useMemo(
    () =>
      Boolean(
        debouncedQuery.trim() ||
          Object.values(debouncedAdvancedFilters).some((value) =>
            Array.isArray(value) ? value.length > 0 : value.trim()
          )
      ),
    [debouncedAdvancedFilters, debouncedQuery]
  );
  const hasCoreSearchTerm = useMemo(
    () =>
      Boolean(
        debouncedQuery.trim() ||
          debouncedAdvancedFilters.title.trim() ||
          debouncedAdvancedFilters.artist.trim() ||
          debouncedAdvancedFilters.album.trim() ||
          debouncedAdvancedFilters.creator.trim()
      ),
    [debouncedAdvancedFilters, debouncedQuery]
  );
  const hasAdvancedFilter = useMemo(
    () =>
      Object.values(debouncedAdvancedFilters).some((value) =>
        Array.isArray(value) ? value.length > 0 : value.trim()
      ),
    [debouncedAdvancedFilters]
  );
  const queryTooShort = useMemo(() => {
    const trimmed = debouncedQuery.trim();
    return trimmed.length > 0 && trimmed.length < 3;
  }, [debouncedQuery]);
  const requiresCoreSearchTerm = useMemo(
    () =>
      !hasCoreSearchTerm &&
      (debouncedAdvancedFilters.parts.length > 0 ||
        debouncedAdvancedFilters.tuning.length > 0 ||
        debouncedAdvancedFilters.year.length > 0),
    [debouncedAdvancedFilters, hasCoreSearchTerm]
  );

  const filterOptionsQuery = useQuery<SearchFilterOptionsResponse>({
    queryKey: ["search-filter-options"],
    queryFn: async () => {
      const response = await fetch("/api/search/filters");
      const body = (await response.json().catch(() => null)) as
        | SearchFilterOptionsResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? "Filter options failed to load.")
            : "Filter options failed to load."
        );
      }

      return body as SearchFilterOptionsResponse;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const { data, error, isFetching, isLoading } = useQuery<SearchResponse>({
    queryKey: ["song-search", searchParams.toString()],
    enabled: !queryTooShort && !requiresCoreSearchTerm,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchResponse> => {
      const response = await fetch(`/api/search?${searchParams.toString()}`);
      const body = (await response.json().catch(() => null)) as
        | SearchResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? "Search failed.")
            : "Search failed."
        );
      }

      return body as SearchResponse;
    },
  });

  const results =
    !queryTooShort && !requiresCoreSearchTerm ? (data?.results ?? []) : [];
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25))
  );
  const visiblePageNumbers = useMemo(() => {
    const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return [...pages]
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  async function copyRequest(song: SearchSong) {
    await navigator.clipboard.writeText(buildRequestCommand(song));
    setCopiedSongId(song.id);
    window.setTimeout(() => {
      setCopiedSongId((current) => (current === song.id ? null : current));
    }, 1600);
  }

  function updateAdvancedFilter(
    key: keyof typeof advancedFilters,
    value: string | string[] | number[]
  ) {
    startTransition(() => {
      setAdvancedFilters((current) => ({
        ...current,
        [key]: value,
      }));
    });
  }

  function clearAdvancedFilters() {
    startTransition(() => {
      setAdvancedFilters({
        title: "",
        artist: "",
        album: "",
        creator: "",
        tuning: [],
        parts: [],
        year: [],
      });
    });
  }

  function toggleAdvancedPart(part: string) {
    startTransition(() => {
      setAdvancedFilters((current) => ({
        ...current,
        parts: current.parts.includes(part)
          ? current.parts.filter((value) => value !== part)
          : [...current.parts, part],
      }));
    });
  }

  function toggleAdvancedTuning(tuning: string) {
    startTransition(() => {
      setAdvancedFilters((current) => ({
        ...current,
        tuning: current.tuning.includes(tuning)
          ? current.tuning.filter((value) => value !== tuning)
          : [...current.tuning, tuning],
      }));
    });
  }

  function toggleAdvancedYear(year: number) {
    startTransition(() => {
      setAdvancedFilters((current) => ({
        ...current,
        year: current.year.includes(year)
          ? current.year.filter((value) => value !== year)
          : [...current.year, year],
      }));
    });
  }

  function renderPagination(position: "top" | "bottom") {
    if (totalPages <= 1) {
      return null;
    }

    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 px-5 py-4",
          position === "top"
            ? "border-b border-(--border) bg-(--panel-muted)"
            : "border-t border-(--border) bg-(--panel-muted)"
        )}
      >
        <p className="text-sm text-(--muted)">
          Page {page} of {totalPages}
        </p>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              />
            </PaginationItem>

            {visiblePageNumbers.map((pageNumber, index) => {
              const previousPage = visiblePageNumbers[index - 1];
              const showGap =
                previousPage != null && pageNumber - previousPage > 1;

              return (
                <Fragment key={pageNumber}>
                  {showGap ? (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : null}
                  <PaginationItem>
                    <PaginationLink
                      isActive={pageNumber === page}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                </Fragment>
              );
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <section className={cn("grid gap-6", props.className)}>
        <Card className="surface-grid bg-(--panel-strong)">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                {props.eyebrow ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
                    {props.eyebrow}
                  </p>
                ) : null}
                <CardTitle
                  className={cn(
                    "text-balance",
                    props.eyebrow ? "mt-3 text-4xl" : "text-2xl"
                  )}
                >
                  {props.title}
                </CardTitle>
                {props.description ? (
                  <p className="mt-2 text-sm text-(--muted)">
                    {props.description}
                  </p>
                ) : null}
                {props.infoNote ? (
                  <div className="mt-4 rounded-[20px] border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                    <p className="font-semibold uppercase tracking-[0.18em] text-sky-200">
                      Note:
                    </p>
                    <p className="mt-2">{props.infoNote}</p>
                  </div>
                ) : null}
              </div>
              {!queryTooShort && !error ? (
                <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) px-4 py-3 text-right">
                  <p className="text-lg font-semibold text-(--text)">
                    {data?.total ?? 0} songs
                  </p>
                  {isFetching ? (
                    <p className="mt-1 text-xs font-medium text-(--muted)">
                      Searching...
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 lg:grid-cols-[1.8fr_190px_190px_170px]">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="pr-4 pl-10!"
                  placeholder={
                    props.placeholder ?? "Search by song title, artist or album"
                  }
                />
              </div>
              <Select
                value={field}
                onValueChange={(value) => setField(value as SearchField)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Search field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All fields</SelectItem>
                  <SelectItem value="title">Title only</SelectItem>
                  <SelectItem value="artist">Artist only</SelectItem>
                  <SelectItem value="album">Album only</SelectItem>
                  <SelectItem value="creator">Creator only</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SearchSort)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Best match</SelectItem>
                  <SelectItem value="artist">Artist</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="album">Album</SelectItem>
                  <SelectItem value="creator">Creator</SelectItem>
                  <SelectItem value="tuning">Tuning</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                  <SelectItem value="downloads">Downloads</SelectItem>
                  <SelectItem value="updated">Recently updated</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortDirection}
                onValueChange={(value) =>
                  setSortDirection(value as "asc" | "desc")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {showAdvanced ? "Hide filters" : "Show filters"}
              </Button>
            </div>

            {showAdvanced ? (
              <div className="grid items-start gap-4 rounded-[24px] border border-(--border) bg-(--panel-soft) p-5 md:grid-cols-2 xl:grid-cols-4">
                <div className="grid gap-2">
                  <Label htmlFor={`${props.title}-advanced-title`}>Title</Label>
                  <Input
                    id={`${props.title}-advanced-title`}
                    value={advancedFilters.title}
                    onChange={(event) =>
                      updateAdvancedFilter("title", event.target.value)
                    }
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${props.title}-advanced-artist`}>
                    Artist
                  </Label>
                  <Input
                    id={`${props.title}-advanced-artist`}
                    value={advancedFilters.artist}
                    onChange={(event) =>
                      updateAdvancedFilter("artist", event.target.value)
                    }
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${props.title}-advanced-album`}>Album</Label>
                  <Input
                    id={`${props.title}-advanced-album`}
                    value={advancedFilters.album}
                    onChange={(event) =>
                      updateAdvancedFilter("album", event.target.value)
                    }
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${props.title}-advanced-creator`}>
                    Creator
                  </Label>
                  <Input
                    id={`${props.title}-advanced-creator`}
                    value={advancedFilters.creator}
                    onChange={(event) =>
                      updateAdvancedFilter("creator", event.target.value)
                    }
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Tuning</Label>
                  <MultiSelectSelect
                    label="Tuning"
                    options={filterOptionsQuery.data?.tunings ?? []}
                    selectedValues={advancedFilters.tuning}
                    onAdd={(value) => toggleAdvancedTuning(value)}
                    onRemove={(value) => toggleAdvancedTuning(value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Path</Label>
                  <MultiSelectSelect
                    label="Path"
                    options={pathOptions.map((part) => formatPathLabel(part))}
                    selectedValues={advancedFilters.parts.map((part) =>
                      formatPathLabel(part)
                    )}
                    onAdd={(value) =>
                      toggleAdvancedPart(getPathTokenFromLabel(value))
                    }
                    onRemove={(value) =>
                      toggleAdvancedPart(getPathTokenFromLabel(value))
                    }
                    toneByValue={getPathToneByValue}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Year</Label>
                  <MultiSelectSelect
                    label="Year"
                    options={(filterOptionsQuery.data?.years ?? []).map(
                      (year) => String(year)
                    )}
                    selectedValues={advancedFilters.year.map((year) =>
                      String(year)
                    )}
                    onAdd={(value) => toggleAdvancedYear(Number(value))}
                    onRemove={(value) => toggleAdvancedYear(Number(value))}
                  />
                </div>
                <div className="grid gap-2 self-start">
                  <Label className="invisible">Actions</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearAdvancedFilters}
                  >
                    Clear advanced filters
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-(--panel-strong)">
          <CardContent className="p-0">
            {renderPagination("top")}

            <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 border-b border-(--border) px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-(--muted)">
              <span>Song</span>
              <span>Details</span>
              <span>Paths / Tuning</span>
              <span>Stats</span>
              <span className="text-right">Copy</span>
            </div>

            {isLoading && results.length === 0 ? (
              <div className="px-5 py-8 text-sm text-(--muted)">
                Loading songs...
              </div>
            ) : null}

            {!isLoading && queryTooShort && !hasAdvancedFilter ? (
              <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 border-b border-(--border) px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-(--muted)">
                <span className="col-span-full normal-case tracking-normal text-sm font-normal text-(--muted)">
                  Search terms must be at least 3 characters.
                </span>
              </div>
            ) : null}

            {!isLoading && requiresCoreSearchTerm ? (
              <div className="px-5 py-8 text-sm text-(--muted)">
                Add a title, artist, album, or creator.
              </div>
            ) : null}

            {!isLoading && !requiresCoreSearchTerm && error ? (
              <div className="px-5 py-8 text-sm text-rose-300">
                {getErrorMessage(error)}
              </div>
            ) : null}

            {!isLoading &&
            !queryTooShort &&
            !requiresCoreSearchTerm &&
            results.length === 0 ? (
              <div className="px-5 py-8 text-sm text-(--muted)">
                {hasSearchInput
                  ? "No songs matched those filters yet. Try broadening the search field or clearing one of the advanced inputs."
                  : "No songs are available in the demo catalog yet."}
              </div>
            ) : null}

            {results.map((song, index) => {
              const requestCommand = buildRequestCommand(song);
              const copied = copiedSongId === song.id;

              return (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => copyRequest(song)}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px] gap-4 border-b border-(--border) px-5 py-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand) focus-visible:ring-inset",
                    index % 2 === 0
                      ? "bg-(--panel-strong)"
                      : "bg-(--panel-soft)",
                    "hover:border-(--brand) hover:bg-(--bg-elevated)"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-(--text)">
                        {song.title}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-sm text-(--brand-deep)">
                      {song.artist ?? "Unknown artist"}
                    </p>
                    {song.album ? (
                      <p className="mt-1 truncate text-sm text-(--muted)">
                        {song.album}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    {song.creator ? (
                      <p className="truncate text-sm text-(--muted)">
                        Charted by {song.creator}
                      </p>
                    ) : null}
                    <p className="mt-2 truncate font-mono text-[11px] text-(--muted)">
                      {requestCommand}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      {song.parts?.includes("lead") ? (
                        <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10">
                          Lead
                        </Badge>
                      ) : null}
                      {song.parts?.includes("rhythm") ? (
                        <Badge className="border-sky-400/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/10">
                          Rhythm
                        </Badge>
                      ) : null}
                      {song.parts?.includes("bass") ? (
                        <Badge className="border-orange-400/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/10">
                          Bass
                        </Badge>
                      ) : null}
                      {song.parts?.includes("voice") ||
                      song.parts?.includes("vocals") ? (
                        <Badge className="border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/10">
                          Lyrics
                        </Badge>
                      ) : null}
                    </div>
                    {song.tuning ? (
                      <p className="mt-2 truncate text-sm text-(--muted)">
                        {song.tuning}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0 text-sm">
                    {song.durationText ? (
                      <p className="text-(--text)">{song.durationText}</p>
                    ) : null}
                    {song.year ? (
                      <p className="mt-1 text-(--muted)">{String(song.year)}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--panel) transition-colors",
                            copied
                              ? "border-emerald-400 text-emerald-400"
                              : "text-(--brand)"
                          )}
                        >
                          {copied ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {copied ? "Copied" : "Copy request command"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </button>
              );
            })}

            {renderPagination("bottom")}
          </CardContent>
        </Card>
      </section>
    </TooltipProvider>
  );
}

function getPathToneByValue(value: string) {
  switch (value.toLowerCase()) {
    case "lead":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
    case "rhythm":
      return "border-sky-400/30 bg-sky-500/10 text-sky-300";
    case "bass":
      return "border-orange-400/30 bg-orange-500/10 text-orange-300";
    case "voice":
    case "vocals":
      return "border-violet-400/30 bg-violet-500/10 text-violet-300";
    default:
      return "border-(--border-strong) bg-(--panel) text-(--text)";
  }
}

function getPathTokenFromLabel(value: string) {
  return value.toLowerCase() === "lyrics" ? "voice" : value.toLowerCase();
}

function MultiSelectSelect(props: {
  label: string;
  options: string[];
  selectedValues: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  toneByValue?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    props.selectedValues.length > 0
      ? `${props.selectedValues.length} selected`
      : `Select ${props.label.toLowerCase()}`;

  return (
    <div className="grid gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full cursor-pointer items-center justify-between rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3 text-sm text-(--text) shadow-(--shadow-soft) transition-[border-color,background,box-shadow] hover:bg-(--bg-elevated)"
          >
            <span>{summary}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-(--muted) transition-transform",
                open ? "rotate-180" : ""
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) rounded-2xl border-(--border) bg-(--panel-strong) p-0 text-(--text)"
        >
          <Command className="rounded-2xl bg-(--panel-strong) text-(--text)">
            <CommandInput
              placeholder={`Filter ${props.label.toLowerCase()}...`}
            />
            <CommandList className="max-h-56">
              <CommandEmpty>No matches found.</CommandEmpty>
              <CommandGroup>
                {props.options.map((option) => {
                  const selected = props.selectedValues.includes(option);

                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => {
                        if (selected) {
                          props.onRemove(option);
                        } else {
                          props.onAdd(option);
                        }
                      }}
                      className={cn(
                        "cursor-pointer gap-3 rounded-xl bg-transparent transition-colors hover:bg-(--panel-strong) data-[selected=true]:bg-(--panel-strong)",
                        selected
                          ? "bg-(--panel-strong) text-(--text) hover:bg-(--panel-strong) data-[selected=true]:text-(--text)"
                          : "text-(--text) data-[selected=true]:text-(--text)"
                      )}
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                      />
                      <span>{option}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {props.selectedValues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.selectedValues.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => props.onRemove(value)}
              className={cn(
                "inline-flex select-none items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                props.toneByValue?.(value) ??
                  "border-(--brand) bg-(--brand)/15 text-(--text)"
              )}
            >
              <span>{value}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
