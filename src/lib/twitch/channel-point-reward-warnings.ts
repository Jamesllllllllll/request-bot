import { TwitchApiError } from "~/lib/twitch/api";

export type ChannelPointRewardSetupIssue =
  | "affiliate_or_partner_required"
  | "reward_limit_reached"
  | "reward_not_app_owned"
  | "reward_title_conflict"
  | "setup_failed";

export type ChannelPointRewardWarningCode =
  | "channel_point_reward_affiliate_or_partner_required"
  | "channel_point_reward_reward_limit_reached"
  | "channel_point_reward_reward_not_app_owned"
  | "channel_point_reward_reward_title_conflict"
  | "channel_point_reward_setup_failed";

export function getChannelPointRewardSetupIssue(
  error: unknown
): ChannelPointRewardSetupIssue | null {
  if (!(error instanceof TwitchApiError)) {
    return null;
  }

  const message = `${error.message}\n${error.body ?? ""}`.toLowerCase();

  if (
    error.status === 403 &&
    message.includes("broadcaster is not a partner or affiliate")
  ) {
    return "affiliate_or_partner_required";
  }

  if (
    error.status === 403 &&
    message.includes("client id used to create the custom reward")
  ) {
    return "reward_not_app_owned";
  }

  if (
    error.status === 400 &&
    (message.includes("maximum of 50 rewards") ||
      message.includes("maximum number of rewards"))
  ) {
    return "reward_limit_reached";
  }

  if (
    error.status === 400 &&
    message.includes("title") &&
    message.includes("unique")
  ) {
    return "reward_title_conflict";
  }

  return "setup_failed";
}

export function getChannelPointRewardWarningCode(
  error: unknown
): ChannelPointRewardWarningCode | null {
  const issue = getChannelPointRewardSetupIssue(error);
  if (!issue) {
    return null;
  }

  switch (issue) {
    case "affiliate_or_partner_required":
      return "channel_point_reward_affiliate_or_partner_required";
    case "reward_limit_reached":
      return "channel_point_reward_reward_limit_reached";
    case "reward_not_app_owned":
      return "channel_point_reward_reward_not_app_owned";
    case "reward_title_conflict":
      return "channel_point_reward_reward_title_conflict";
    case "setup_failed":
      return "channel_point_reward_setup_failed";
  }
}

export function isChannelPointRewardWarningCode(
  value: string
): value is ChannelPointRewardWarningCode {
  return [
    "channel_point_reward_affiliate_or_partner_required",
    "channel_point_reward_reward_limit_reached",
    "channel_point_reward_reward_not_app_owned",
    "channel_point_reward_reward_title_conflict",
    "channel_point_reward_setup_failed",
  ].includes(value);
}

export function getChannelPointRewardWarningMessage(
  code: ChannelPointRewardWarningCode
) {
  switch (code) {
    case "channel_point_reward_affiliate_or_partner_required":
      return "Twitch channel point rewards are only available on Affiliate or Partner channels. Your other bot settings were saved.";
    case "channel_point_reward_reward_limit_reached":
      return "Twitch only allows 50 custom rewards per channel. Remove or disable a reward on Twitch, then save again.";
    case "channel_point_reward_reward_not_app_owned":
      return "The saved Twitch reward is no longer managed by RockList.Live. Remove that reward on Twitch, then save again.";
    case "channel_point_reward_reward_title_conflict":
      return "A Twitch reward named RockList VIP Token already exists. Rename or remove that reward on Twitch, then save again.";
    case "channel_point_reward_setup_failed":
      return "Your other bot settings were saved, but RockList.Live could not finish the Twitch channel point reward setup. Check your Twitch rewards, then save again.";
  }
}

export function getChannelPointRewardWarningMessageFromWarnings(
  warnings: readonly string[] | null | undefined
) {
  const warning = warnings?.find(isChannelPointRewardWarningCode);
  return warning ? getChannelPointRewardWarningMessage(warning) : null;
}
