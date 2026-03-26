export interface TwitchTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[];
  token_type: string;
  id_token?: string;
}

export interface TwitchUserResponse {
  data: Array<{
    id: string;
    login: string;
    display_name: string;
    profile_image_url: string;
  }>;
}

export interface TwitchChannelSearchResponse {
  data: Array<{
    id: string;
    broadcaster_login: string;
    display_name: string;
    thumbnail_url: string;
    is_live?: boolean;
    game_name?: string;
    title?: string;
  }>;
}

export interface TwitchChattersResponse {
  data: Array<{
    user_id: string;
    user_login: string;
    user_name: string;
  }>;
  pagination?: {
    cursor?: string;
  };
}

export interface TwitchModeratedChannelsResponse {
  data: Array<{
    broadcaster_id: string;
    broadcaster_login: string;
    broadcaster_name: string;
  }>;
  pagination?: {
    cursor?: string;
  };
}

export interface TwitchStreamsResponse {
  data: Array<{
    user_id: string;
    user_login: string;
    user_name: string;
    type: string;
    title: string;
    started_at: string;
    thumbnail_url: string;
  }>;
}

export interface EventSubChatMessageEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: {
    text: string;
  };
  badges?: Array<{
    set_id: string;
    id: string;
    info?: string;
  }>;
}

export interface EventSubStreamOnlineEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  id: string;
  type: string;
  started_at: string;
}

export interface EventSubStreamOfflineEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
}

export interface EventSubSubscriptionGiftEvent {
  user_id?: string | null;
  user_login?: string | null;
  user_name?: string | null;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  total: number;
  tier: string;
  cumulative_total?: number | null;
  is_anonymous: boolean;
}

export interface EventSubSubscribeEvent {
  user_id: string;
  user_login: string;
  user_name: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  tier: string;
  is_gift: boolean;
}

export interface EventSubCheerEvent {
  is_anonymous: boolean;
  user_id?: string | null;
  user_login?: string | null;
  user_name?: string | null;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  message: string;
  bits: number;
}

export interface TwitchEventSubCreateResponse {
  data: Array<{
    id: string;
    status: string;
    type: string;
    version: string;
    condition: Record<string, string>;
    created_at: string;
    transport: {
      method: string;
      callback: string;
    };
    cost: number;
  }>;
  total: number;
  total_cost: number;
  max_total_cost: number;
}

export interface TwitchEventSubListResponse {
  data: Array<{
    id: string;
    status: string;
    type: string;
    version: string;
    condition: Record<string, string>;
    created_at: string;
    transport: {
      method: string;
      callback?: string;
    };
    cost: number;
  }>;
  total: number;
  total_cost: number;
  max_total_cost: number;
  pagination?: {
    cursor?: string;
  };
}
