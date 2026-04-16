import { normalizePathOptions, type pathOptions } from "~/lib/channel-options";

export type PanelSearchPath = (typeof pathOptions)[number];

export type PanelSearchFilters = {
  favoritesOnly: boolean;
  title: string;
  artist: string;
  album: string;
  creator: string;
  tuning: number[];
  parts: PanelSearchPath[];
  partsMatchMode: "any" | "all";
  year: number[];
};

type PanelSearchFiltersInput = {
  favoritesOnly?: boolean;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  creator?: string | null;
  tuning?: Array<number | string | null | undefined> | null;
  parts?: Array<string | null | undefined> | null;
  partsMatchMode?: PanelSearchFilters["partsMatchMode"];
  year?: Array<number | string | null | undefined> | null;
};

function normalizePanelSearchNumberList(
  values: Array<number | string | null | undefined> | null | undefined,
  validate: (value: number) => boolean
) {
  const normalized = new Set<number>();

  for (const value of values ?? []) {
    const candidate =
      typeof value === "number"
        ? Math.trunc(value)
        : Number.parseInt(String(value ?? "").trim(), 10);
    if (Number.isFinite(candidate) && validate(candidate)) {
      normalized.add(candidate);
    }
  }

  return [...normalized].sort((left, right) => left - right);
}

export function normalizePanelSearchPaths(
  paths: Array<string | null | undefined> | null | undefined
) {
  return normalizePathOptions(paths) as PanelSearchPath[];
}

export function createPanelSearchFilters(
  input?: PanelSearchFiltersInput
): PanelSearchFilters {
  const parts = normalizePanelSearchPaths(input?.parts);

  return {
    favoritesOnly: input?.favoritesOnly ?? false,
    title: typeof input?.title === "string" ? input.title : "",
    artist: typeof input?.artist === "string" ? input.artist : "",
    album: typeof input?.album === "string" ? input.album : "",
    creator: typeof input?.creator === "string" ? input.creator : "",
    tuning: normalizePanelSearchNumberList(input?.tuning, (value) => value > 0),
    parts,
    partsMatchMode:
      input?.partsMatchMode === "all" && parts.length > 1 ? "all" : "any",
    year: normalizePanelSearchNumberList(
      input?.year,
      (value) => value >= 1 && value <= 2100
    ),
  };
}

export function canonicalizePanelSearchFilters(filters: PanelSearchFilters) {
  return createPanelSearchFilters({
    ...filters,
    title: filters.title.trim(),
    artist: filters.artist.trim(),
    album: filters.album.trim(),
    creator: filters.creator.trim(),
  });
}

export function haveSameSelectedValues<T extends number | string>(
  left: T[],
  right: T[]
) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left]
    .map((value) => String(value))
    .sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));
  const normalizedRight = [...right]
    .map((value) => String(value))
    .sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));

  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index]
  );
}

export function getPanelSearchNonPathFilterCount(filters: PanelSearchFilters) {
  const normalized = canonicalizePanelSearchFilters(filters);

  return [
    normalized.favoritesOnly ? "favorites" : "",
    normalized.title,
    normalized.artist,
    normalized.album,
    normalized.creator,
    normalized.tuning.length > 0 ? "tuning" : "",
    normalized.year.length > 0 ? "year" : "",
  ].filter(Boolean).length;
}

export function hasCustomPanelPathFilters(
  filters: PanelSearchFilters,
  defaultFilters: PanelSearchFilters
) {
  return (
    filters.partsMatchMode !== defaultFilters.partsMatchMode ||
    !haveSameSelectedValues(filters.parts, defaultFilters.parts)
  );
}

export function arePanelSearchFiltersEqual(
  left: PanelSearchFilters,
  right: PanelSearchFilters
) {
  const normalizedLeft = canonicalizePanelSearchFilters(left);
  const normalizedRight = canonicalizePanelSearchFilters(right);

  return (
    normalizedLeft.favoritesOnly === normalizedRight.favoritesOnly &&
    normalizedLeft.title === normalizedRight.title &&
    normalizedLeft.artist === normalizedRight.artist &&
    normalizedLeft.album === normalizedRight.album &&
    normalizedLeft.creator === normalizedRight.creator &&
    normalizedLeft.partsMatchMode === normalizedRight.partsMatchMode &&
    haveSameSelectedValues(normalizedLeft.tuning, normalizedRight.tuning) &&
    haveSameSelectedValues(normalizedLeft.parts, normalizedRight.parts) &&
    haveSameSelectedValues(normalizedLeft.year, normalizedRight.year)
  );
}

export function canRunPanelSearch(query: string, filters: PanelSearchFilters) {
  const normalizedQuery = query.trim();
  return (
    normalizedQuery.length >= 3 ||
    (normalizedQuery.length === 0 &&
      (getPanelSearchNonPathFilterCount(filters) > 0 ||
        filters.parts.length > 0))
  );
}

export function appendPanelSearchFiltersToParams(
  params: URLSearchParams,
  filters: PanelSearchFilters
) {
  const normalized = canonicalizePanelSearchFilters(filters);

  if (normalized.favoritesOnly) {
    params.set("favoritesOnly", "true");
  }

  if (normalized.title) {
    params.set("title", normalized.title);
  }
  if (normalized.artist) {
    params.set("artist", normalized.artist);
  }
  if (normalized.album) {
    params.set("album", normalized.album);
  }
  if (normalized.creator) {
    params.set("creator", normalized.creator);
  }

  for (const tuning of normalized.tuning) {
    params.append("tuning", String(tuning));
  }
  for (const part of normalized.parts) {
    params.append("parts", part);
  }
  for (const year of normalized.year) {
    params.append("year", String(year));
  }

  if (normalized.parts.length > 0) {
    params.set("partsMatchMode", normalized.partsMatchMode);
  }
}
