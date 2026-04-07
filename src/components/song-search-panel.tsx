import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Clock3,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
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
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import {
  formatCompactTuningSummary,
  getUniqueTunings,
} from "~/lib/tuning-summary";
import { cn, getErrorMessage } from "~/lib/utils";

type SearchField = "any" | "title" | "artist" | "album" | "creator";

export interface SearchSong {
  id: string;
  groupedProjectId?: number;
  artistId?: number;
  authorId?: number;
  title: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
  durationText?: string;
  durationSeconds?: number;
  year?: number;
  downloads?: number;
  sourceUpdatedAt?: number;
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
  hiddenBlacklistedCount?: number;
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

export function buildVipRequestCommand(
  song: SearchSong,
  vipTokenCost?: number
) {
  const baseCommand = buildRequestCommand(song).replace(/^!sr\b/, "!vip");

  if (vipTokenCost == null || vipTokenCost <= 1) {
    return baseCommand;
  }

  return `${baseCommand} *${Math.trunc(vipTokenCost)}`;
}

export function buildEditRequestCommand(song: SearchSong) {
  return buildRequestCommand(song).replace(/^!sr\b/, "!edit");
}

export type SearchSongResultState = {
  disabled?: boolean;
  reasons?: string[];
  warning?: string;
  vipTokenCost?: number;
};

export type SearchSongResultContext = {
  activePathFilters: string[];
  activePathFilterMatchMode: "any" | "all";
  defaultPathFilters: string[];
  defaultPathFilterMatchMode: "any" | "all";
  hasOverriddenDefaultPathFilters: boolean;
};

export type SearchSongActionRenderArgs = {
  song: SearchSong;
  resultState: SearchSongResultState;
};

type SearchPanelControlsRenderArgs = {
  query: string;
  debouncedQuery: string;
  data?: SearchResponse;
  visibleResults: SearchSong[];
  isLoading: boolean;
  queryTooShort: boolean;
  hasSearchInput: boolean;
};

export function SongSearchPanel(props: {
  title: string;
  eyebrow?: string;
  description?: string;
  infoNote?: string;
  placeholder?: string;
  className?: string;
  searchEnabled?: boolean;
  headerActionsContent?: ReactNode;
  defaultPathFilters?: string[];
  defaultPathFilterMatchMode?: "any" | "all";
  defaultPathFilterOwnerName?: string;
  extraSearchParams?: Record<string, string | number | boolean | undefined>;
  resultFilter?: (song: SearchSong) => boolean;
  resultState?: (
    song: SearchSong,
    context: SearchSongResultContext
  ) => SearchSongResultState;
  advancedFiltersContent?:
    | ReactNode
    | ((args: {
        data?: SearchResponse;
        visibleResults: SearchSong[];
      }) => ReactNode);
  useTotalForSummary?: boolean;
  summaryContent?: ReactNode;
  controlsContent?:
    | ReactNode
    | ((args: SearchPanelControlsRenderArgs) => ReactNode);
  actionsLabel?: string;
  renderActions?: (args: SearchSongActionRenderArgs) => ReactNode;
}) {
  const { locale } = useAppLocale();
  const { t } = useLocaleTranslation("search");
  const updatedDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [locale]
  );
  const getPathLabel = (path: string) => {
    switch (path.toLowerCase()) {
      case "lead":
        return t("paths.lead");
      case "rhythm":
        return t("paths.rhythm");
      case "bass":
        return t("paths.bass");
      case "voice":
      case "vocals":
        return t("paths.lyrics");
      default:
        return path;
    }
  };
  const getPathShortLabel = (path: string) =>
    getPathLabel(path).slice(0, 1).toUpperCase();
  const normalizedDefaultPathFilters = useMemo(
    () =>
      [...new Set(props.defaultPathFilters ?? [])].filter((path) =>
        pathOptions.includes(path as (typeof pathOptions)[number])
      ),
    [props.defaultPathFilters]
  );
  const defaultPathFilterMatchMode = props.defaultPathFilterMatchMode ?? "any";
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [field, setField] = useState<SearchField>("any");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<{
    songId: string;
    type: "sr" | "edit" | "vip";
  } | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState(() => ({
    title: "",
    artist: "",
    album: "",
    creator: "",
    tuning: [] as string[],
    parts: normalizedDefaultPathFilters,
    partsMatchMode: props.defaultPathFilterMatchMode ?? "any",
    year: [] as number[],
  }));
  const [debouncedAdvancedFilters, setDebouncedAdvancedFilters] =
    useState(advancedFilters);
  const extraSearchParamsKey = useMemo(
    () => JSON.stringify(props.extraSearchParams ?? {}),
    [props.extraSearchParams]
  );
  const activePathFilters = debouncedAdvancedFilters.parts;
  const activeNonPathFilterCount = useMemo(
    () =>
      [
        debouncedAdvancedFilters.title.trim(),
        debouncedAdvancedFilters.artist.trim(),
        debouncedAdvancedFilters.album.trim(),
        debouncedAdvancedFilters.creator.trim(),
        debouncedAdvancedFilters.tuning.length > 0 ? "tuning" : "",
        debouncedAdvancedFilters.year.length > 0 ? "year" : "",
      ].filter(Boolean).length,
    [debouncedAdvancedFilters]
  );
  const showAppliedFiltersSummary =
    activePathFilters.length > 0 || activeNonPathFilterCount > 0;

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
  }, [debouncedAdvancedFilters, debouncedQuery, extraSearchParamsKey, field]);

  const searchParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      field,
    });

    if (debouncedQuery.trim()) {
      params.set("query", debouncedQuery.trim());
    }

    for (const [key, value] of Object.entries(debouncedAdvancedFilters)) {
      if (
        key === "partsMatchMode" &&
        debouncedAdvancedFilters.parts.length === 0
      ) {
        continue;
      }

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

    if (props.extraSearchParams) {
      for (const [key, value] of Object.entries(props.extraSearchParams)) {
        if (value === undefined) {
          continue;
        }

        params.set(key, String(value));
      }
    }

    return params;
  }, [
    debouncedAdvancedFilters,
    debouncedQuery,
    field,
    page,
    props.extraSearchParams,
  ]);

  const hasSearchInput = useMemo(
    () =>
      Boolean(
        debouncedQuery.trim() ||
          Object.entries(debouncedAdvancedFilters).some(([key, value]) =>
            key === "partsMatchMode"
              ? false
              : Array.isArray(value)
                ? value.length > 0
                : value.trim()
          )
      ),
    [debouncedAdvancedFilters, debouncedQuery]
  );
  const hasAdvancedFilter = useMemo(
    () =>
      Object.entries(debouncedAdvancedFilters).some(([key, value]) =>
        key === "partsMatchMode"
          ? false
          : Array.isArray(value)
            ? value.length > 0
            : value.trim()
      ),
    [debouncedAdvancedFilters]
  );
  const queryTooShort = useMemo(() => {
    const trimmed = debouncedQuery.trim();
    return trimmed.length > 0 && trimmed.length < 3;
  }, [debouncedQuery]);
  const searchEnabled = props.searchEnabled ?? true;

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
            ? (body.message ?? t("errors.filterOptionsFailed"))
            : t("errors.filterOptionsFailed")
        );
      }

      return body as SearchFilterOptionsResponse;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const shouldLoadCatalogTotal = Boolean(props.infoNote?.includes("{count}"));
  const catalogTotalQuery = useQuery<Pick<SearchResponse, "total">>({
    queryKey: ["song-search-total-count"],
    queryFn: async () => {
      const response = await fetch("/api/search?page=1&pageSize=1&field=any");
      const body = (await response.json().catch(() => null)) as
        | SearchResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? t("errors.searchFailed"))
            : t("errors.searchFailed")
        );
      }

      return { total: (body as SearchResponse).total };
    },
    enabled: shouldLoadCatalogTotal,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const searchQuery = useQuery<SearchResponse>({
    queryKey: ["song-search", searchParams.toString()],
    enabled: searchEnabled && !queryTooShort,
    queryFn: async (): Promise<SearchResponse> => {
      const response = await fetch(`/api/search?${searchParams.toString()}`);
      const body = (await response.json().catch(() => null)) as
        | SearchResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? t("errors.searchFailed"))
            : t("errors.searchFailed")
        );
      }

      return body as SearchResponse;
    },
  });
  const { data, error, isLoading } = searchQuery;
  const isResultsTransitioning = searchQuery.isFetching;

  const results = !queryTooShort && !error ? (data?.results ?? []) : [];
  const visibleResults = useMemo(
    () =>
      props.resultFilter
        ? results.filter((song) => props.resultFilter?.(song))
        : results,
    [props.resultFilter, results]
  );
  const resolvedInfoNote = props.infoNote?.replace(
    "{count}",
    String(catalogTotalQuery.data?.total ?? 0)
  );
  const summaryCount = props.useTotalForSummary
    ? (data?.total ?? 0)
    : visibleResults.length;
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20))
  );
  const visiblePageNumbers = useMemo(() => {
    const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return [...pages]
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);
  const hasCustomActions = typeof props.renderActions === "function";
  const resultsGridColumns = hasCustomActions
    ? "grid-cols-[minmax(0,2.2fr)_minmax(0,1.05fr)_minmax(0,1.15fr)_248px]"
    : "grid-cols-[minmax(0,2.2fr)_minmax(0,1.05fr)_minmax(0,1.15fr)_188px]";
  const resolvedAdvancedFiltersContent =
    typeof props.advancedFiltersContent === "function"
      ? props.advancedFiltersContent({
          data,
          visibleResults,
        })
      : props.advancedFiltersContent;
  const resolvedControlsContent =
    typeof props.controlsContent === "function"
      ? props.controlsContent({
          query,
          debouncedQuery,
          data,
          visibleResults,
          isLoading,
          queryTooShort,
          hasSearchInput,
        })
      : props.controlsContent;

  async function copyRequest(
    song: SearchSong,
    type: "sr" | "edit" | "vip" = "sr",
    vipTokenCost?: number
  ) {
    const command =
      type === "vip"
        ? buildVipRequestCommand(song, vipTokenCost)
        : type === "edit"
          ? buildEditRequestCommand(song)
          : buildRequestCommand(song);
    await navigator.clipboard.writeText(command);
    setCopiedCommand({ songId: song.id, type });
    window.setTimeout(() => {
      setCopiedCommand((current) =>
        current?.songId === song.id && current.type === type ? null : current
      );
    }, 1600);
  }

  function updateAdvancedFilter(
    key: keyof typeof advancedFilters,
    value: string | string[] | number[]
  ) {
    setAdvancedFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function clearAdvancedFilters() {
    setAdvancedFilters({
      title: "",
      artist: "",
      album: "",
      creator: "",
      tuning: [],
      parts: [],
      partsMatchMode: "any",
      year: [],
    });
  }

  function toggleAdvancedPart(part: string) {
    setAdvancedFilters((current) => ({
      ...current,
      parts: current.parts.includes(part)
        ? current.parts.filter((value) => value !== part)
        : [...current.parts, part],
    }));
  }

  function toggleAdvancedTuning(tuning: string) {
    setAdvancedFilters((current) => ({
      ...current,
      tuning: current.tuning.includes(tuning)
        ? current.tuning.filter((value) => value !== tuning)
        : [...current.tuning, tuning],
    }));
  }

  function toggleAdvancedYear(year: number) {
    setAdvancedFilters((current) => ({
      ...current,
      year: current.year.includes(year)
        ? current.year.filter((value) => value !== year)
        : [...current.year, year],
    }));
  }

  function renderPagination(position: "top" | "bottom") {
    const showTopFilterSummary =
      position === "top" && showAppliedFiltersSummary;
    const showTopCount =
      position === "top" && !queryTooShort && !error && data != null;

    if (totalPages <= 1 && !showTopFilterSummary && !showTopCount) {
      return null;
    }

    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 px-5 py-4",
          position === "top"
            ? "border-b border-(--border) bg-(--panel-muted)"
            : "border-t border-(--border) bg-(--panel-muted)"
        )}
      >
        <div className="min-w-0 flex flex-1 items-center gap-3 py-1.5">
          {showTopCount ? (
            <p className="shrink-0 text-sm font-semibold text-(--text)">
              {t("summary.foundCount", { count: summaryCount })}
            </p>
          ) : null}
          {showTopCount && showTopFilterSummary ? (
            <div className="h-5 w-px shrink-0 bg-(--border)" />
          ) : null}
          {showTopFilterSummary ? (
            <div className="min-w-0 flex flex-wrap items-center gap-1.5 text-xs text-(--muted)">
              <span className="uppercase tracking-[0.16em]">
                {t("summary.filters")}
              </span>
              {activePathFilters.map((path) => (
                <PathBadge
                  key={`summary-${path}`}
                  label={getPathLabel(path).toUpperCase()}
                  shortLabel={getPathShortLabel(path)}
                  className={getPathToneByValue(path)}
                />
              ))}
              {activeNonPathFilterCount > 0 ? (
                <span className="inline-flex items-center border border-(--border-strong) bg-(--panel) px-2 py-1 text-[11px] font-medium text-(--text)">
                  {t("summary.moreCount", { count: activeNonPathFilterCount })}
                </span>
              ) : null}
              {!showAdvanced ? (
                <button
                  type="button"
                  className="text-(--brand) transition hover:opacity-80"
                  onClick={() => setShowAdvanced(true)}
                >
                  {t("summary.changeFilters")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {totalPages > 1 ? (
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1 || isResultsTransitioning}
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
                        disabled={isResultsTransitioning}
                        className="p-0"
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  </Fragment>
                );
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || isResultsTransitioning}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    );
  }

  function renderDefaultActions(
    song: SearchSong,
    resultState: SearchSongResultState,
    isDisabled: boolean,
    disabledReason: string,
    copiedType: "sr" | "edit" | "vip" | null
  ) {
    const vipTokenCost = resultState.vipTokenCost;
    const vipButtonLabel =
      vipTokenCost != null && vipTokenCost > 1
        ? `!vip *${Math.trunc(vipTokenCost)}`
        : "!vip";

    return (
      <div className="grid grid-cols-3 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void copyRequest(song, "sr")}
              disabled={isDisabled}
              className={cn(
                "flex h-11 min-w-[3.25rem] items-center justify-center border border-(--border) bg-(--panel) px-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
                isDisabled && "cursor-not-allowed opacity-45",
                copiedType === "sr"
                  ? "border-emerald-400 text-emerald-400"
                  : "text-(--brand)"
              )}
            >
              {copiedType === "sr" ? <Check className="h-4 w-4" /> : "!sr"}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isDisabled
              ? disabledReason
              : copiedType === "sr"
                ? t("commands.copiedSr")
                : t("commands.copySr")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void copyRequest(song, "edit")}
              disabled={isDisabled}
              className={cn(
                "flex h-11 min-w-[3.75rem] items-center justify-center border border-(--border) bg-(--panel) px-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
                isDisabled && "cursor-not-allowed opacity-45",
                copiedType === "edit"
                  ? "border-emerald-400 text-emerald-400"
                  : "text-(--brand)"
              )}
            >
              {copiedType === "edit" ? <Check className="h-4 w-4" /> : "!edit"}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isDisabled
              ? disabledReason
              : copiedType === "edit"
                ? t("commands.copiedEdit")
                : t("commands.copyEdit")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void copyRequest(song, "vip", vipTokenCost)}
              disabled={isDisabled}
              className={cn(
                "flex h-11 min-w-[3.5rem] items-center justify-center border border-(--border) bg-(--panel) px-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
                isDisabled && "cursor-not-allowed opacity-45",
                copiedType === "vip"
                  ? "border-emerald-400 text-emerald-400"
                  : "text-(--brand-deep)"
              )}
            >
              {copiedType === "vip" ? (
                <Check className="h-4 w-4" />
              ) : (
                vipButtonLabel
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isDisabled
              ? disabledReason
              : copiedType === "vip"
                ? t("commands.copiedVip")
                : t("commands.copyVip")}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <section className={cn("search-panel grid gap-6", props.className)}>
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
              </div>
              <div className="flex max-w-full flex-wrap items-center justify-end gap-3 max-[960px]:w-full max-[960px]:justify-start">
                {props.summaryContent}
                {props.headerActionsContent}
                {resolvedInfoNote ? (
                  <div className="flex flex-wrap items-center gap-2 border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 max-[960px]:w-full">
                    <span className="font-semibold uppercase tracking-[0.18em] text-sky-200">
                      {t("summary.note")}
                    </span>
                    <span>{resolvedInfoNote}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 lg:grid-cols-[1.8fr_190px_170px] max-[960px]:grid-cols-1">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="pr-4 pl-10!"
                  placeholder={props.placeholder ?? t("page.placeholder")}
                />
              </div>
              <Select
                value={field}
                onValueChange={(value) => setField(value as SearchField)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("controls.searchField")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("controls.allFields")}</SelectItem>
                  <SelectItem value="title">
                    {t("controls.titleOnly")}
                  </SelectItem>
                  <SelectItem value="artist">
                    {t("controls.artistOnly")}
                  </SelectItem>
                  <SelectItem value="album">
                    {t("controls.albumOnly")}
                  </SelectItem>
                  <SelectItem value="creator">
                    {t("controls.creatorOnly")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </span>
                {showAdvanced
                  ? t("controls.hideFilters")
                  : t("controls.showFilters")}
              </Button>
            </div>

            {showAdvanced ? (
              <div className="grid gap-4 border border-(--border) bg-(--panel-soft) p-5">
                <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-2">
                    <Label htmlFor={`${props.title}-advanced-title`}>
                      {t("controls.title")}
                    </Label>
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
                      {t("controls.artist")}
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
                    <Label htmlFor={`${props.title}-advanced-album`}>
                      {t("controls.album")}
                    </Label>
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
                      {t("controls.creator")}
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
                    <Label>{t("controls.tuning")}</Label>
                    <MultiSelectSelect
                      label={t("controls.tuning")}
                      options={filterOptionsQuery.data?.tunings ?? []}
                      selectedValues={advancedFilters.tuning}
                      onAdd={(value) => toggleAdvancedTuning(value)}
                      onRemove={(value) => toggleAdvancedTuning(value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("controls.path")}</Label>
                    <MultiSelectSelect
                      label={t("controls.path")}
                      options={pathOptions}
                      selectedValues={advancedFilters.parts}
                      onAdd={(value) => toggleAdvancedPart(value)}
                      onRemove={(value) => toggleAdvancedPart(value)}
                      renderValue={getPathLabel}
                      toneByValue={getPathToneByValue}
                    />
                    {advancedFilters.parts.length > 1 ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            advancedFilters.partsMatchMode === "any"
                              ? "secondary"
                              : "ghost"
                          }
                          className="h-8 px-3 text-[11px] tracking-[0.05em] shadow-none"
                          onClick={() =>
                            updateAdvancedFilter("partsMatchMode", "any")
                          }
                        >
                          {t("controls.matchAny")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            advancedFilters.partsMatchMode === "all"
                              ? "secondary"
                              : "ghost"
                          }
                          className="h-8 px-3 text-[11px] tracking-[0.05em] shadow-none"
                          onClick={() =>
                            updateAdvancedFilter("partsMatchMode", "all")
                          }
                        >
                          {t("controls.matchAll")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("controls.year")}</Label>
                    <MultiSelectSelect
                      label={t("controls.year")}
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
                    <Label className="invisible">{t("controls.actions")}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearAdvancedFilters}
                    >
                      {t("controls.clearAdvancedFilters")}
                    </Button>
                  </div>
                </div>

                {resolvedAdvancedFiltersContent ? (
                  <div className="grid gap-2">
                    {resolvedAdvancedFiltersContent}
                  </div>
                ) : null}
              </div>
            ) : null}

            {resolvedControlsContent ? (
              <div className="grid gap-3">{resolvedControlsContent}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-(--panel-strong) [container-type:inline-size]">
          <CardContent className="p-0">
            {renderPagination("top")}

            <div className="overflow-hidden">
              <div>
                <div
                  className={cn(
                    "search-panel__table-head grid gap-4 border-b border-(--border) px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-(--muted)",
                    resultsGridColumns
                  )}
                >
                  <span>{t("columns.song")}</span>
                  <span>{t("columns.paths")}</span>
                  <span>{t("columns.stats")}</span>
                  <span className="text-right">
                    {props.actionsLabel ?? t("columns.actions")}
                  </span>
                </div>

                {isLoading && results.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-(--muted)">
                    {t("states.loading")}
                  </div>
                ) : null}

                {!isLoading && queryTooShort && !hasAdvancedFilter ? (
                  <div
                    className={cn(
                      "grid gap-4 border-b border-(--border) px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-(--muted)",
                      resultsGridColumns
                    )}
                  >
                    <span className="col-span-full normal-case tracking-normal text-sm font-normal text-(--muted)">
                      {t("states.queryTooShort")}
                    </span>
                  </div>
                ) : null}

                {!isLoading && error ? (
                  <div className="px-5 py-8 text-sm text-rose-300">
                    {getErrorMessage(error)}
                  </div>
                ) : null}

                {!isLoading && !queryTooShort && visibleResults.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-(--muted)">
                    {hasSearchInput
                      ? t("states.emptyFiltered")
                      : t("states.emptyCatalog")}
                  </div>
                ) : null}

                {visibleResults.map((song, index) => {
                  const copiedType =
                    copiedCommand?.songId === song.id
                      ? copiedCommand.type
                      : null;
                  const resultStateContext: SearchSongResultContext = {
                    activePathFilters: advancedFilters.parts,
                    activePathFilterMatchMode: advancedFilters.partsMatchMode,
                    defaultPathFilters: normalizedDefaultPathFilters,
                    defaultPathFilterMatchMode,
                    hasOverriddenDefaultPathFilters:
                      advancedFilters.partsMatchMode !==
                        defaultPathFilterMatchMode ||
                      !haveSameSelectedValues(
                        advancedFilters.parts,
                        normalizedDefaultPathFilters
                      ),
                  };
                  const resultState =
                    props.resultState?.(song, resultStateContext) ?? {};
                  const isDisabled = resultState.disabled === true;
                  const disabledReason =
                    resultState.reasons && resultState.reasons.length > 0
                      ? t("states.blacklistedWithReasons", {
                          reasons: resultState.reasons.join(" · "),
                        })
                      : t("states.blacklisted");
                  const compactTuning = formatCompactTuningSummary([
                    song.tuning,
                  ]);
                  const tuningTitle =
                    compactTuning && song.tuning
                      ? (() => {
                          const fullTuningSummary = getUniqueTunings([
                            song.tuning,
                          ]).join(" | ");
                          return fullTuningSummary !== compactTuning
                            ? fullTuningSummary
                            : undefined;
                        })()
                      : undefined;

                  return (
                    <div
                      key={song.id}
                      className={cn(
                        "search-panel__row grid w-full gap-4 border-b border-(--border) px-5 py-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand) focus-visible:ring-inset",
                        resultsGridColumns,
                        index % 2 === 0
                          ? "bg-(--panel-strong)"
                          : "bg-(--panel-soft)",
                        isDisabled
                          ? "border-amber-400/35 bg-amber-500/8"
                          : "hover:border-(--brand) hover:bg-(--bg-elevated)"
                      )}
                    >
                      {hasCustomActions ? (
                        <div className="search-panel__row-main col-span-2 grid min-w-0 grid-cols-[minmax(0,2.2fr)_minmax(0,1.05fr)] gap-4 text-left">
                          <div className="search-panel__song min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[15px] font-semibold text-(--text)">
                                {song.title}
                              </p>
                              {isDisabled ? (
                                <span className="inline-flex items-center border border-amber-700/50 bg-amber-950 px-2 py-[3px] text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
                                  {disabledReason}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-sm text-(--brand-deep)">
                              {song.artist ?? t("states.unknownArtist")}
                            </p>
                            {song.album ? (
                              <p className="mt-1 truncate text-sm text-(--muted)">
                                {song.album}
                                {song.year ? ` - ${song.year}` : ""}
                              </p>
                            ) : null}
                          </div>

                          <div className="search-panel__paths min-w-0">
                            <div className="flex flex-wrap gap-2">
                              {song.parts?.includes("lead") ? (
                                <PathBadge
                                  label={t("paths.lead")}
                                  shortLabel={getPathShortLabel("lead")}
                                  className="border-emerald-700/50 bg-emerald-950 text-emerald-100 hover:bg-emerald-950"
                                />
                              ) : null}
                              {song.parts?.includes("rhythm") ? (
                                <PathBadge
                                  label={t("paths.rhythm")}
                                  shortLabel={getPathShortLabel("rhythm")}
                                  className="border-sky-700/50 bg-sky-950 text-sky-100 hover:bg-sky-950"
                                />
                              ) : null}
                              {song.parts?.includes("bass") ? (
                                <PathBadge
                                  label={t("paths.bass")}
                                  shortLabel={getPathShortLabel("bass")}
                                  className="border-orange-700/50 bg-orange-950 text-orange-100 hover:bg-orange-950"
                                />
                              ) : null}
                              {song.parts?.includes("voice") ||
                              song.parts?.includes("vocals") ? (
                                <PathBadge
                                  label={t("paths.lyrics")}
                                  shortLabel={getPathShortLabel("voice")}
                                  className="border-violet-700/50 bg-violet-950 text-violet-100 hover:bg-violet-950"
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isDisabled) {
                              void copyRequest(song, "sr");
                            }
                          }}
                          disabled={isDisabled}
                          className={cn(
                            "search-panel__row-main col-span-2 grid min-w-0 grid-cols-[minmax(0,2.2fr)_minmax(0,1.05fr)] gap-4 text-left",
                            isDisabled
                              ? "cursor-not-allowed opacity-85"
                              : "cursor-pointer"
                          )}
                        >
                          <div className="search-panel__song min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[15px] font-semibold text-(--text)">
                                {song.title}
                              </p>
                              {isDisabled ? (
                                <span className="inline-flex items-center border border-amber-700/50 bg-amber-950 px-2 py-[3px] text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
                                  {disabledReason}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-sm text-(--brand-deep)">
                              {song.artist ?? t("states.unknownArtist")}
                            </p>
                            {song.album ? (
                              <p className="mt-1 truncate text-sm text-(--muted)">
                                {song.album}
                                {song.year ? ` - ${song.year}` : ""}
                              </p>
                            ) : null}
                          </div>

                          <div className="search-panel__paths min-w-0">
                            <div className="flex flex-wrap gap-2">
                              {song.parts?.includes("lead") ? (
                                <PathBadge
                                  label={t("paths.lead")}
                                  shortLabel={getPathShortLabel("lead")}
                                  className="border-emerald-700/50 bg-emerald-950 text-emerald-100 hover:bg-emerald-950"
                                />
                              ) : null}
                              {song.parts?.includes("rhythm") ? (
                                <PathBadge
                                  label={t("paths.rhythm")}
                                  shortLabel={getPathShortLabel("rhythm")}
                                  className="border-sky-700/50 bg-sky-950 text-sky-100 hover:bg-sky-950"
                                />
                              ) : null}
                              {song.parts?.includes("bass") ? (
                                <PathBadge
                                  label={t("paths.bass")}
                                  shortLabel={getPathShortLabel("bass")}
                                  className="border-orange-700/50 bg-orange-950 text-orange-100 hover:bg-orange-950"
                                />
                              ) : null}
                              {song.parts?.includes("voice") ||
                              song.parts?.includes("vocals") ? (
                                <PathBadge
                                  label={t("paths.lyrics")}
                                  shortLabel={getPathShortLabel("voice")}
                                  className="border-violet-700/50 bg-violet-950 text-violet-100 hover:bg-violet-950"
                                />
                              ) : null}
                            </div>
                          </div>
                        </button>
                      )}

                      <div className="search-panel__stats min-w-0 text-sm">
                        {song.durationText || compactTuning ? (
                          <p className="search-panel__desktop-stat inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-(--text)">
                            {song.durationText ? (
                              <>
                                <Clock3 className="h-3.5 w-3.5 text-(--muted)" />
                                <span>{song.durationText}</span>
                              </>
                            ) : null}
                            {song.durationText && compactTuning ? (
                              <span className="text-(--muted)">·</span>
                            ) : null}
                            {compactTuning ? (
                              <span
                                className="truncate text-(--muted)"
                                title={tuningTitle}
                              >
                                {compactTuning}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                        {song.creator ? (
                          <p className="mt-1 truncate text-sm text-(--muted)">
                            {t("states.chartedBy", { creator: song.creator })}
                          </p>
                        ) : null}
                        {song.sourceUpdatedAt ? (
                          <p className="mt-1 text-(--muted)">
                            {t("states.updated", {
                              date: updatedDateFormatter.format(
                                new Date(song.sourceUpdatedAt)
                              ),
                            })}
                          </p>
                        ) : null}
                      </div>

                      <div className="search-panel__copy grid justify-items-end gap-2">
                        {hasCustomActions
                          ? props.renderActions?.({ song, resultState })
                          : renderDefaultActions(
                              song,
                              resultState,
                              isDisabled,
                              disabledReason,
                              copiedType
                            )}
                        {resultState.warning ? (
                          <p className="max-w-[18rem] text-right text-xs text-amber-200">
                            {resultState.warning}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {renderPagination("bottom")}
          </CardContent>
        </Card>
      </section>
    </TooltipProvider>
  );
}

function PathBadge(props: {
  label: string;
  shortLabel: string;
  className: string;
}) {
  return (
    <Badge
      className={cn(
        "max-[720px]:min-w-[1.75rem] max-[720px]:justify-center max-[720px]:px-[0.45rem]",
        props.className
      )}
    >
      <span className="max-[720px]:hidden">{props.label}</span>
      <span className="hidden max-[720px]:inline">{props.shortLabel}</span>
    </Badge>
  );
}

function getPathToneByValue(value: string) {
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

function haveSameSelectedValues(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index]
  );
}

function MultiSelectSelect(props: {
  label: string;
  options: readonly string[];
  selectedValues: readonly string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  renderValue?: (value: string) => string;
  toneByValue?: (value: string) => string;
}) {
  const { t } = useLocaleTranslation("search");
  const [open, setOpen] = useState(false);
  const renderValue = props.renderValue ?? ((value: string) => value);
  const summary =
    props.selectedValues.length > 0
      ? t("multiSelect.selected", { count: props.selectedValues.length })
      : t("multiSelect.select", { label: props.label });

  return (
    <div className="grid gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full cursor-pointer items-center justify-between border border-(--border) bg-(--panel-soft) px-4 py-3 text-sm text-(--text) shadow-none transition-[border-color,background,box-shadow] hover:bg-(--bg-elevated)"
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
          className="w-(--radix-popover-trigger-width) border-(--border) bg-(--panel-strong) p-0 text-(--text)"
        >
          <Command className="bg-(--panel-strong) text-(--text)">
            <CommandInput
              placeholder={t("multiSelect.filter", { label: props.label })}
            />
            <CommandList className="max-h-56">
              <CommandEmpty>{t("multiSelect.noMatches")}</CommandEmpty>
              <CommandGroup>
                {props.options.map((option) => {
                  const selected = props.selectedValues.includes(option);
                  const optionLabel = renderValue(option);

                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      keywords={[optionLabel]}
                      onSelect={() => {
                        if (selected) {
                          props.onRemove(option);
                        } else {
                          props.onAdd(option);
                        }
                      }}
                      className={cn(
                        "cursor-pointer gap-3 bg-transparent transition-colors hover:bg-(--panel-strong) data-[selected=true]:bg-(--panel-strong)",
                        selected
                          ? "bg-(--panel-strong) text-(--text) hover:bg-(--panel-strong) data-[selected=true]:text-(--text)"
                          : "text-(--text) data-[selected=true]:text-(--text)"
                      )}
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none"
                      />
                      <span>{optionLabel}</span>
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
                "inline-flex select-none items-center gap-1 border px-3 py-1.5 text-xs font-semibold transition-colors",
                props.toneByValue?.(value) ??
                  "border-(--brand) bg-(--brand)/15 text-(--text)"
              )}
            >
              <span>{renderValue(value)}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
