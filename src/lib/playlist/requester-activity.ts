export const REQUESTER_INACTIVE_THRESHOLD_MINUTES = 15;
export const REQUESTER_INACTIVE_THRESHOLD_MS =
  REQUESTER_INACTIVE_THRESHOLD_MINUTES * 60 * 1000;
export const REQUESTER_ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;

export type RequesterChatActivity = {
  twitchUserId: string;
  login: string;
  lastChatAt: number;
};

export function attachRequesterLastChatActivity<
  T extends Record<string, unknown>,
>(
  items: T[],
  activityRows: RequesterChatActivity[]
): Array<T & { requesterLastChatAt?: number }> {
  if (items.length === 0 || activityRows.length === 0) {
    return items;
  }

  const activityByTwitchUserId = new Map<string, RequesterChatActivity>();
  const activityByLogin = new Map<string, RequesterChatActivity>();

  for (const row of activityRows) {
    if (!activityByTwitchUserId.has(row.twitchUserId)) {
      activityByTwitchUserId.set(row.twitchUserId, row);
    }
    if (!activityByLogin.has(row.login)) {
      activityByLogin.set(row.login, row);
    }
  }

  return items.map((item) => {
    const twitchUserId =
      typeof item.requestedByTwitchUserId === "string"
        ? item.requestedByTwitchUserId.trim()
        : "";
    const login =
      typeof item.requestedByLogin === "string"
        ? item.requestedByLogin.trim().toLowerCase()
        : "";
    const activity =
      (twitchUserId ? activityByTwitchUserId.get(twitchUserId) : undefined) ??
      (login ? activityByLogin.get(login) : undefined);

    return activity
      ? {
          ...item,
          requesterLastChatAt: activity.lastChatAt,
        }
      : item;
  });
}

export function isRequesterInactive(
  lastChatAt?: number | null,
  now = Date.now()
) {
  return (
    typeof lastChatAt === "number" &&
    Number.isFinite(lastChatAt) &&
    now - lastChatAt >= REQUESTER_INACTIVE_THRESHOLD_MS
  );
}

export function mergeRequesterLastChatActivity<
  T extends { id: string; requesterLastChatAt?: number | null },
>(
  items: T[],
  nextItems: Array<{ id: string; requesterLastChatAt?: number | null }>
) {
  if (items.length === 0 || nextItems.length === 0) {
    return items;
  }

  const lastChatAtByItemId = new Map<string, number>();

  for (const item of nextItems) {
    if (typeof item.requesterLastChatAt === "number") {
      lastChatAtByItemId.set(item.id, item.requesterLastChatAt);
    }
  }

  if (lastChatAtByItemId.size === 0) {
    return items;
  }

  return items.map((item) => {
    const requesterLastChatAt = lastChatAtByItemId.get(item.id);
    return requesterLastChatAt == null
      ? item
      : {
          ...item,
          requesterLastChatAt,
        };
  });
}
