export interface AddRequestInput {
  channelId: string;
  requestedByTwitchUserId: string;
  requestedByLogin: string;
  requestedByDisplayName: string;
  messageId?: string;
  prioritizeNext?: boolean;
  requestKind?: "regular" | "vip";
  vipTokenCost?: number;
  song: {
    id: string;
    title: string;
    authorId?: number;
    groupedProjectId?: number;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[];
    durationText?: string;
    cdlcId?: number;
    source: string;
    sourceUrl?: string;
    requestedQuery?: string;
    warningCode?: string;
    warningMessage?: string;
    candidateMatchesJson?: string;
  };
}

export interface RemoveRequestsInput {
  channelId: string;
  requesterTwitchUserId: string;
  requesterLogin: string;
  actorUserId: string | null;
  kind: "regular" | "vip" | "all";
  itemId?: string;
}

export interface ChangeRequestKindInput {
  channelId: string;
  itemId: string;
  actorUserId: string | null;
  requestKind: "regular" | "vip";
  vipTokenCost?: number;
}

export interface EditRequestInput {
  channelId: string;
  itemId: string;
  actorUserId: string | null;
  requestKind: "regular" | "vip";
  vipTokenCost?: number;
  song: {
    id: string;
    title: string;
    authorId?: number;
    groupedProjectId?: number;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[] | string;
    durationText?: string;
    cdlcId?: number;
    source: string;
    sourceUrl?: string;
    requestedQuery?: string;
    warningCode?: string;
    warningMessage?: string;
    candidateMatchesJson?: string;
  };
}

export interface MarkPlayedInput {
  channelId: string;
  itemId: string;
  actorUserId: string;
}

export interface SetCurrentInput {
  channelId: string;
  itemId: string;
  actorUserId: string;
}

export interface ReturnToQueueInput {
  channelId: string;
  itemId: string;
  actorUserId: string;
}

export interface RestorePlayedInput {
  channelId: string;
  playedSongId: string;
  actorUserId: string;
}

export interface ShuffleNextInput {
  channelId: string;
  actorUserId: string;
}

export interface ReorderItemsInput {
  channelId: string;
  orderedItemIds: string[];
  actorUserId: string;
}

export interface DeleteItemInput {
  channelId: string;
  itemId: string;
  actorUserId: string;
}

export interface ChooseVersionInput {
  channelId: string;
  itemId: string;
  candidateId: string;
  actorUserId: string;
}

export interface ClearPlaylistInput {
  channelId: string;
  actorUserId: string;
}

export interface ResetSessionInput {
  channelId: string;
  actorUserId: string;
}

export interface ShufflePlaylistInput {
  channelId: string;
  actorUserId: string;
}

export interface ManualAddInput {
  channelId: string;
  actorUserId: string;
  requesterLogin?: string;
  requesterTwitchUserId?: string;
  requesterDisplayName?: string;
  song: {
    id: string;
    title: string;
    authorId?: number;
    groupedProjectId?: number;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[];
    durationText?: string;
    cdlcId?: number;
    source: string;
    sourceUrl?: string;
    requestedQuery?: string;
    warningCode?: string;
    warningMessage?: string;
    candidateMatchesJson?: string;
  };
}

export interface PlaylistMutationResult {
  ok: boolean;
  duplicate?: boolean;
  playlistId: string;
  currentItemId?: string | null;
  changedItemId?: string;
  message: string;
}

export interface PlaylistCoordinator {
  addRequest(input: AddRequestInput): Promise<PlaylistMutationResult>;
  editRequest(input: EditRequestInput): Promise<PlaylistMutationResult>;
  changeRequestKind(
    input: ChangeRequestKindInput
  ): Promise<PlaylistMutationResult>;
  removeRequests(input: RemoveRequestsInput): Promise<PlaylistMutationResult>;
  markPlayed(input: MarkPlayedInput): Promise<PlaylistMutationResult>;
  restorePlayed(input: RestorePlayedInput): Promise<PlaylistMutationResult>;
  setCurrent(input: SetCurrentInput): Promise<PlaylistMutationResult>;
  returnToQueue(input: ReturnToQueueInput): Promise<PlaylistMutationResult>;
  shuffleNext(input: ShuffleNextInput): Promise<PlaylistMutationResult>;
  shufflePlaylist(input: ShufflePlaylistInput): Promise<PlaylistMutationResult>;
  reorderItems(input: ReorderItemsInput): Promise<PlaylistMutationResult>;
  deleteItem(input: DeleteItemInput): Promise<PlaylistMutationResult>;
  chooseVersion(input: ChooseVersionInput): Promise<PlaylistMutationResult>;
  clearPlaylist(input: ClearPlaylistInput): Promise<PlaylistMutationResult>;
  resetSession(input: ResetSessionInput): Promise<PlaylistMutationResult>;
  manualAdd(input: ManualAddInput): Promise<PlaylistMutationResult>;
}
