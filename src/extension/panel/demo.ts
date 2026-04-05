export type PanelDemoPlaylistItem = Record<string, unknown>;

export type PanelDemoPlaylist = {
  currentItemId: string | null;
  items: PanelDemoPlaylistItem[];
};

export type PanelDemoViewerProfile = {
  twitchUserId: string;
  login: string;
  displayName: string;
  profileImageUrl?: string | null;
  isSubscriber: boolean;
  subscriptionVerified: boolean;
  vipTokensAvailable: number;
  activeRequestLimit: number | null;
};

export const mockModeratorViewerProfile: PanelDemoViewerProfile = {
  twitchUserId: "mod-preview-user",
  login: "modmark",
  displayName: "ModMark",
  profileImageUrl: null,
  isSubscriber: true,
  subscriptionVerified: true,
  vipTokensAvailable: 2,
  activeRequestLimit: 5,
};

export function createMockModeratorPlaylistItems(): PanelDemoPlaylistItem[] {
  const now = Date.now();

  return [
    {
      id: "preview-current",
      songTitle: "On My Soul",
      songArtist: "Bruno Mars",
      requestedByTwitchUserId: "viewer-alpha",
      requestedByLogin: "riffpilot",
      requestedByDisplayName: "RiffPilot",
      requestKind: "regular",
      createdAt: now - 12 * 60_000,
      updatedAt: now - 12 * 60_000,
      status: "current",
      position: 1,
      regularPosition: 1,
    },
    {
      id: "preview-queued-1",
      songTitle: "Black Cat",
      songArtist: "Janet Jackson",
      requestedByTwitchUserId: "viewer-beta",
      requestedByLogin: "duhstructo",
      requestedByDisplayName: "Duhstructo",
      requestKind: "vip",
      createdAt: now - 8 * 60_000,
      updatedAt: now - 6 * 60_000,
      status: "queued",
      position: 2,
      regularPosition: 2,
    },
    {
      id: "preview-queued-2",
      songTitle: "The Trooper",
      songArtist: "Iron Maiden",
      requestedByTwitchUserId: "viewer-gamma",
      requestedByLogin: "younggun",
      requestedByDisplayName: "YoungGun",
      requestKind: "regular",
      createdAt: now - 5 * 60_000,
      updatedAt: now - 5 * 60_000,
      status: "queued",
      position: 3,
      regularPosition: 3,
    },
    {
      id: "preview-queued-3",
      songTitle: "Barracuda",
      songArtist: "Heart",
      requestedByTwitchUserId: "viewer-delta",
      requestedByLogin: "riffqueen",
      requestedByDisplayName: "RiffQueen",
      requestKind: "regular",
      createdAt: now - 3 * 60_000,
      updatedAt: now - 3 * 60_000,
      status: "queued",
      position: 4,
      regularPosition: 4,
    },
  ];
}

export function getDemoViewerActiveRequests(
  playlist: PanelDemoPlaylist,
  viewerTwitchUserId: string
) {
  return playlist.items.filter(
    (item) =>
      getString(item, "requestedByTwitchUserId") === viewerTwitchUserId &&
      (getString(item, "status") === "queued" ||
        getString(item, "status") === "current")
  );
}

export function applyDemoViewerRequestMutation(input: {
  playlist: PanelDemoPlaylist;
  viewerProfile: PanelDemoViewerProfile;
  song?: Record<string, unknown>;
  query?: string;
  requestMode?: "catalog" | "random" | "choice";
  requestKind: "regular" | "vip";
  requestedPath?: string;
  vipTokenCost?: number;
  replaceExisting: boolean;
  replaceItemId?: string;
  now?: number;
  nextId?: string;
}): PanelDemoPlaylist {
  const now = input.now ?? Date.now();
  const requestMode = input.requestMode ?? "catalog";
  const songRecord = input.song ?? {};
  const songId =
    requestMode === "choice"
      ? `preview-choice-${now}`
      : (getString(songRecord, "id") ?? `preview-song-${now}`);
  const nextId = input.nextId ?? `preview-request-${songId}-${now}`;
  const replaceTarget =
    input.replaceItemId != null
      ? (input.playlist.items.find(
          (item) =>
            getString(item, "id") === input.replaceItemId &&
            getString(item, "requestedByTwitchUserId") ===
              input.viewerProfile.twitchUserId &&
            (getString(item, "status") === "queued" ||
              getString(item, "status") === "current")
        ) ?? null)
      : null;
  const activeViewerRequestIds = new Set(
    getDemoViewerActiveRequests(
      input.playlist,
      input.viewerProfile.twitchUserId
    )
      .map((item) => getString(item, "id"))
      .filter((itemId): itemId is string => Boolean(itemId))
  );
  if (replaceTarget) {
    return {
      currentItemId: input.playlist.currentItemId,
      items: input.playlist.items.map((item, index) =>
        getString(item, "id") === replaceTarget.id
          ? {
              ...item,
              songId,
              songTitle:
                requestMode === "choice"
                  ? "Streamer choice"
                  : (getString(songRecord, "title") ?? "Unknown song"),
              songArtist:
                requestMode === "choice"
                  ? null
                  : getString(songRecord, "artist"),
              songAlbum:
                requestMode === "choice"
                  ? null
                  : getString(songRecord, "album"),
              songCreator:
                requestMode === "choice"
                  ? null
                  : getString(songRecord, "creator"),
              songCatalogSourceId:
                requestMode === "choice"
                  ? null
                  : getNumber(songRecord, "sourceId"),
              songGroupedProjectId:
                requestMode === "choice"
                  ? null
                  : getNumber(songRecord, "groupedProjectId"),
              songArtistId:
                requestMode === "choice"
                  ? null
                  : getNumber(songRecord, "artistId"),
              songCharterId:
                requestMode === "choice"
                  ? null
                  : getNumber(songRecord, "authorId"),
              requestedQuery:
                requestMode === "choice"
                  ? (input.query?.trim() ?? null)
                  : input.requestedPath
                    ? `*${input.requestedPath}`
                    : null,
              warningCode: requestMode === "choice" ? "streamer_choice" : null,
              requestKind: input.requestKind,
              vipTokenCost:
                typeof input.vipTokenCost === "number" && input.vipTokenCost > 0
                  ? input.vipTokenCost
                  : null,
              editedAt: now,
              updatedAt: now,
              position: index + 1,
              regularPosition: getNumber(item, "regularPosition") ?? index + 1,
              status:
                getString(item, "id") === input.playlist.currentItemId
                  ? "current"
                  : "queued",
            }
          : {
              ...item,
              position: index + 1,
              regularPosition: getNumber(item, "regularPosition") ?? index + 1,
              status:
                getString(item, "id") === input.playlist.currentItemId
                  ? "current"
                  : "queued",
            }
      ),
    };
  }

  const baseItems = input.replaceExisting
    ? input.playlist.items.filter((item) => {
        const itemId = getString(item, "id");
        return !itemId || !activeViewerRequestIds.has(itemId);
      })
    : input.playlist.items.slice();

  const nextItem: PanelDemoPlaylistItem = {
    id: nextId,
    songId,
    songTitle:
      requestMode === "choice"
        ? "Streamer choice"
        : (getString(songRecord, "title") ?? "Unknown song"),
    songArtist:
      requestMode === "choice" ? null : getString(songRecord, "artist"),
    songAlbum: requestMode === "choice" ? null : getString(songRecord, "album"),
    songCreator:
      requestMode === "choice" ? null : getString(songRecord, "creator"),
    songCatalogSourceId:
      requestMode === "choice" ? null : getNumber(songRecord, "sourceId"),
    songGroupedProjectId:
      requestMode === "choice"
        ? null
        : getNumber(songRecord, "groupedProjectId"),
    songArtistId:
      requestMode === "choice" ? null : getNumber(songRecord, "artistId"),
    songCharterId:
      requestMode === "choice" ? null : getNumber(songRecord, "authorId"),
    requestedQuery:
      requestMode === "choice"
        ? (input.query?.trim() ?? null)
        : input.requestedPath
          ? `*${input.requestedPath}`
          : null,
    warningCode: requestMode === "choice" ? "streamer_choice" : null,
    requestedByTwitchUserId: input.viewerProfile.twitchUserId,
    requestedByLogin: input.viewerProfile.login,
    requestedByDisplayName: input.viewerProfile.displayName,
    requestKind: input.requestKind,
    vipTokenCost:
      typeof input.vipTokenCost === "number" && input.vipTokenCost > 0
        ? input.vipTokenCost
        : null,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    position: baseItems.length + 1,
    regularPosition: baseItems.length + 1,
  };

  return {
    currentItemId: input.playlist.currentItemId,
    items: [...baseItems, nextItem].map((item, index) => ({
      ...item,
      position: index + 1,
      regularPosition: getNumber(item, "regularPosition") ?? index + 1,
      status:
        getString(item, "id") === input.playlist.currentItemId
          ? "current"
          : "queued",
    })),
  };
}

function getString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
