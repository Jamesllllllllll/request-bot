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
    broadcaster_type?: string;
  }>;
}

export interface TwitchChannelSearchResponse {
  data: Array<{
    id: string;
    broadcaster_login: string;
    broadcaster_language?: string;
    display_name: string;
    thumbnail_url: string;
    is_live?: boolean;
    game_name?: string;
    tags?: string[];
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

export interface TwitchBroadcasterSubscriptionsResponse {
  data: Array<{
    broadcaster_id: string;
    broadcaster_login: string;
    broadcaster_name: string;
    gifter_id?: string | null;
    gifter_login?: string | null;
    gifter_name?: string | null;
    is_gift: boolean;
    plan_name?: string;
    tier: string;
    user_id: string;
    user_login: string;
    user_name: string;
  }>;
  pagination?: {
    cursor?: string;
  };
  points?: number;
  total?: number;
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

export interface EventSubSubscriptionMessageEvent {
  user_id: string;
  user_login: string;
  user_name: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  tier: string;
  cumulative_months?: number;
  streak_months?: number | null;
  duration_months?: number;
  message: {
    text: string;
  };
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

export interface EventSubChannelPointRewardRedemptionEvent {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  user_id: string;
  user_login: string;
  user_name: string;
  user_input?: string;
  status: string;
  reward: {
    id: string;
    title: string;
    cost: number;
    prompt?: string;
  };
}

export interface EventSubRaidEvent {
  from_broadcaster_user_id: string;
  from_broadcaster_user_login: string;
  from_broadcaster_user_name: string;
  to_broadcaster_user_id: string;
  to_broadcaster_user_login: string;
  to_broadcaster_user_name: string;
  viewers: number;
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

export interface TwitchCustomReward {
  id: string;
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  title: string;
  prompt: string;
  cost: number;
  is_enabled: boolean;
  is_paused?: boolean;
  is_in_stock?: boolean;
  should_redemptions_skip_request_queue?: boolean;
}

export interface TwitchCustomRewardsResponse {
  data: TwitchCustomReward[];
}
