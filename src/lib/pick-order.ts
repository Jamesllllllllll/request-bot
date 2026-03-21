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
