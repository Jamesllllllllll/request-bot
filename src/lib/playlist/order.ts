export type PlaylistOrderItem = {
  id: string;
  position: number;
  regularPosition?: number | null;
  status: string;
  requestKind?: string | null;
};

export function getStoredRegularPosition(item: PlaylistOrderItem) {
  return typeof item.regularPosition === "number" &&
    Number.isFinite(item.regularPosition)
    ? item.regularPosition
    : item.position;
}

export function getNextRegularPosition(items: PlaylistOrderItem[]) {
  return items.length
    ? Math.max(...items.map((item) => getStoredRegularPosition(item))) + 1
    : 1;
}

export function getCompactedRegularPositionAssignments(
  items: PlaylistOrderItem[]
) {
  return [...items]
    .sort((left, right) => {
      const leftRegularPosition = getStoredRegularPosition(left);
      const rightRegularPosition = getStoredRegularPosition(right);

      if (leftRegularPosition !== rightRegularPosition) {
        return leftRegularPosition - rightRegularPosition;
      }

      return left.position - right.position;
    })
    .map((item, index) => ({
      id: item.id,
      regularPosition: index + 1,
    }));
}

export function getRegularPositionAssignmentsFromCurrentOrder(
  items: PlaylistOrderItem[]
) {
  return [...items]
    .sort((left, right) => left.position - right.position)
    .map((item, index) => ({
      id: item.id,
      regularPosition: index + 1,
    }));
}

export function getQueuedPositionsFromRegularOrder(items: PlaylistOrderItem[]) {
  return [...items]
    .sort((left, right) => {
      const leftRegularPosition = getStoredRegularPosition(left);
      const rightRegularPosition = getStoredRegularPosition(right);

      if (leftRegularPosition !== rightRegularPosition) {
        return leftRegularPosition - rightRegularPosition;
      }

      return left.position - right.position;
    })
    .map((item, index) => ({
      id: item.id,
      position: index + 1,
    }));
}

export function getUpdatedPositionsAfterSetCurrent(input: {
  items: PlaylistOrderItem[];
  targetItemId: string;
}) {
  const target = input.items.find((item) => item.id === input.targetItemId);

  if (!target) {
    throw new Error("Playlist item not found");
  }

  const queuedAfterCurrent = getQueuedPositionsFromRegularOrder(
    input.items.filter((item) => item.id !== input.targetItemId)
  );

  return [
    {
      id: target.id,
      position: 1,
    },
    ...queuedAfterCurrent.map((item) => ({
      id: item.id,
      position: item.position + 1,
    })),
  ];
}

export function getUpdatedQueuedPositionsAfterKindChange(input: {
  items: PlaylistOrderItem[];
  playlistCurrentItemId?: string | null;
  targetItemId: string;
  requestKind: "regular" | "vip";
}) {
  const sortedItems = [...input.items].sort((a, b) => a.position - b.position);
  const target = sortedItems.find((item) => item.id === input.targetItemId);

  if (!target) {
    throw new Error("Playlist item not found");
  }

  if (target.status === "current") {
    return sortedItems.map((item) => ({
      id: item.id,
      position: item.position,
    }));
  }

  const queued = sortedItems.filter((item) => item.status === "queued");
  const remainingQueued = queued.filter(
    (item) => item.id !== input.targetItemId
  );
  const currentItem = input.playlistCurrentItemId
    ? (sortedItems.find((item) => item.id === input.playlistCurrentItemId) ??
      null)
    : null;

  const reorderedQueued =
    input.requestKind === "vip"
      ? [target, ...remainingQueued]
      : (() => {
          const vipQueued = remainingQueued.filter(
            (item) => item.requestKind === "vip"
          );
          const regularQueued = remainingQueued
            .filter((item) => item.requestKind !== "vip")
            .concat(target)
            .sort((left, right) => {
              const leftRegularPosition = getStoredRegularPosition(left);
              const rightRegularPosition = getStoredRegularPosition(right);

              if (leftRegularPosition !== rightRegularPosition) {
                return leftRegularPosition - rightRegularPosition;
              }

              return left.position - right.position;
            });

          return vipQueued.concat(regularQueued);
        })();

  const queuedStartPosition = currentItem ? currentItem.position + 1 : 1;

  return reorderedQueued.map((item, index) => ({
    id: item.id,
    position: queuedStartPosition + index,
  }));
}
