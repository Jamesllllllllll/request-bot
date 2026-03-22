import type { EventSubChatMessageEvent } from "./twitch/types";

export type SupportedChatCommand =
  | "sr"
  | "vip"
  | "edit"
  | "remove"
  | "how"
  | "blacklist"
  | "setlist"
  | "search"
  | "addvip";

export interface ParsedChatCommand {
  command: SupportedChatCommand;
  query?: string;
  targetLogin?: string;
}

export interface NormalizedChatEvent {
  broadcasterTwitchUserId: string;
  broadcasterLogin: string;
  broadcasterDisplayName: string;
  chatterTwitchUserId: string;
  chatterLogin: string;
  chatterDisplayName: string;
  messageId: string;
  rawMessage: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  isVip: boolean;
  isSubscriber: boolean;
}

function hasBadge(event: EventSubChatMessageEvent, setId: string) {
  return event.badges?.some((badge) => badge.set_id === setId) ?? false;
}

export function parseChatCommand(
  message: string,
  commandPrefix = "!"
): ParsedChatCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith(commandPrefix)) {
    return null;
  }

  const withoutPrefix = trimmed.slice(commandPrefix.length).trim();
  const [rawCommand, ...rest] = withoutPrefix.split(/\s+/);
  const command = rawCommand?.toLowerCase();
  const query = rest.join(" ").trim();

  if (
    command === "sr" ||
    command === "vip" ||
    command === "edit" ||
    command === "replace"
  ) {
    if (!query) {
      return null;
    }

    const requestTarget = extractTrailingTargetLogin(query);
    if (!requestTarget.query) {
      return null;
    }

    return {
      command: command === "replace" ? "edit" : command,
      query: requestTarget.query,
      targetLogin: requestTarget.targetLogin,
    };
  }

  if (command === "addvip" || command === "remove") {
    if (!query) {
      return null;
    }

    if (command === "addvip") {
      const normalizedLogin = normalizeLoginArgument(query);
      if (!normalizedLogin) {
        return null;
      }

      return {
        command,
        query: normalizedLogin,
      };
    }

    const requestTarget = extractTrailingTargetLogin(query);
    if (!requestTarget.query) {
      return null;
    }

    return {
      command,
      query: requestTarget.query,
      targetLogin: requestTarget.targetLogin,
    };
  }

  if (
    command === "how" ||
    command === "blacklist" ||
    command === "setlist" ||
    command === "search"
  ) {
    return {
      command,
    };
  }

  return null;
}

export function parseSongRequest(message: string, commandPrefix = "!sr") {
  const parsed = parseChatCommand(message, commandPrefix.slice(0, 1));
  if (!parsed || parsed.command !== "sr" || !parsed.query) {
    return null;
  }

  return {
    command: commandPrefix,
    query: parsed.query,
  };
}

function extractTrailingTargetLogin(query: string) {
  const trimmed = query.trim();
  const match = /^(.*?)(?:\s+@([a-z0-9_]{2,25}))$/i.exec(trimmed);

  if (!match) {
    return {
      query: trimmed,
      targetLogin: undefined,
    };
  }

  return {
    query: match[1]?.trim() ?? "",
    targetLogin: match[2]?.trim().toLowerCase(),
  };
}

function normalizeLoginArgument(value: string) {
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^@+/, "")
    .toLowerCase();
}

export function normalizeChatEvent(
  event: EventSubChatMessageEvent
): NormalizedChatEvent {
  return {
    broadcasterTwitchUserId: event.broadcaster_user_id,
    broadcasterLogin: event.broadcaster_user_login,
    broadcasterDisplayName: event.broadcaster_user_name,
    chatterTwitchUserId: event.chatter_user_id,
    chatterLogin: event.chatter_user_login,
    chatterDisplayName: event.chatter_user_name,
    messageId: event.message_id,
    rawMessage: event.message.text,
    isBroadcaster:
      event.broadcaster_user_id === event.chatter_user_id ||
      hasBadge(event, "broadcaster"),
    isModerator: hasBadge(event, "moderator"),
    isVip: hasBadge(event, "vip"),
    isSubscriber: hasBadge(event, "subscriber"),
  };
}
