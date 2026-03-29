export function getBotStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Active";
    case "active_offline_testing":
      return "Offline testing enabled";
    case "waiting_for_live":
      return "Waiting to go live";
    case "bot_auth_required":
      return "Bot auth required";
    case "broadcaster_auth_required":
      return "Broadcaster auth required";
    case "subscription_error":
      return "Subscription error";
    default:
      return "Disabled";
  }
}

export function getBotStatusMessage(status: string) {
  switch (status) {
    case "active":
      return "Ready for chat requests.";
    case "active_offline_testing":
      return "Offline testing is on.";
    case "waiting_for_live":
      return "The bot starts when you go live.";
    case "bot_auth_required":
      return "An admin needs to connect the bot.";
    case "broadcaster_auth_required":
      return "Reconnect Twitch.";
    case "subscription_error":
      return "There was a Twitch subscription issue.";
    default:
      return "The bot is off.";
  }
}
