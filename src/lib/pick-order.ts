import type { AppLocale } from "./i18n/locales";

export type PickOrderQueueItem = {
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  createdAt?: number | null;
};

export type PickOrderPlayedSong = {
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedAt?: number | null;
  playedAt?: number | null;
  createdAt?: number | null;
};

function getRequesterKey(input: {
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
}) {
  return input.requestedByTwitchUserId || input.requestedByLogin || "";
}

function getPlayedTimestamp(song: PickOrderPlayedSong, index: number) {
  return song.requestedAt ?? song.createdAt ?? song.playedAt ?? index;
}

function getQueueTimestamp(item: PickOrderQueueItem, index: number) {
  return item.createdAt ?? index;
}

export function getPickNumbersForQueuedItems<TItem extends PickOrderQueueItem>(
  items: TItem[],
  playedSongs: PickOrderPlayedSong[]
) {
  const requestEvents = [
    ...playedSongs.map((song, index) => ({
      kind: "played" as const,
      key: getRequesterKey(song),
      timestamp: getPlayedTimestamp(song, index),
      index,
    })),
    ...items.map((item, index) => ({
      kind: "queued" as const,
      key: getRequesterKey(item),
      timestamp: getQueueTimestamp(item, index),
      index,
    })),
  ]
    .filter((event) => event.key)
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }

      if (left.kind !== right.kind) {
        return left.kind === "played" ? -1 : 1;
      }

      return left.index - right.index;
    });

  const counts = new Map<string, number>();
  const pickNumbersByIndex = new Map<number, number>();

  for (const event of requestEvents) {
    const nextCount = (counts.get(event.key) ?? 0) + 1;
    counts.set(event.key, nextCount);

    if (event.kind === "queued") {
      pickNumbersByIndex.set(event.index, nextCount);
    }
  }

  return items.map((item, index) =>
    getRequesterKey(item) ? (pickNumbersByIndex.get(index) ?? null) : null
  );
}

function normalizePickLocale(locale: AppLocale) {
  return locale.toLowerCase();
}

export function formatPickOrdinal(locale: AppLocale, pickNumber: number) {
  const normalizedLocale = normalizePickLocale(locale);

  if (normalizedLocale === "fr") {
    return pickNumber === 1 ? "1er" : `${pickNumber}e`;
  }

  if (normalizedLocale === "es") {
    return `${pickNumber}.a`;
  }

  if (normalizedLocale === "pt-br") {
    return `${pickNumber}a`;
  }

  const remainderTen = pickNumber % 10;
  const remainderHundred = pickNumber % 100;

  if (remainderTen === 1 && remainderHundred !== 11) {
    return `${pickNumber}st`;
  }

  if (remainderTen === 2 && remainderHundred !== 12) {
    return `${pickNumber}nd`;
  }

  if (remainderTen === 3 && remainderHundred !== 13) {
    return `${pickNumber}rd`;
  }

  return `${pickNumber}th`;
}

export function getPickBadgeAppearance(pickNumber: number) {
  if (pickNumber === 1) {
    return {
      background: "#16a34a",
      color: "#052e16",
    };
  }

  if (pickNumber === 2) {
    return {
      background: "#eab308",
      color: "#422006",
    };
  }

  if (pickNumber === 3) {
    return {
      background: "#f97316",
      color: "#431407",
    };
  }

  return {
    background: "#475569",
    color: "#f8fafc",
  };
}

export function getPickBadgeLabel(input: {
  locale: AppLocale;
  pickNumber: number;
  translate: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (input.pickNumber === 1) {
    return input.translate("row.picks.first");
  }

  if (input.pickNumber === 2) {
    return input.translate("row.picks.second");
  }

  if (input.pickNumber === 3) {
    return input.translate("row.picks.third");
  }

  return input.translate("row.picks.nth", {
    ordinal: formatPickOrdinal(input.locale, input.pickNumber),
  });
}
