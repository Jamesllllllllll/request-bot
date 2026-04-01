export function getBotStatusKey(status: string) {
  switch (status) {
    case "active":
      return "active";
    case "active_offline_testing":
      return "activeOfflineTesting";
    case "waiting_for_live":
      return "waitingForLive";
    case "bot_auth_required":
      return "botAuthRequired";
    case "broadcaster_auth_required":
      return "broadcasterAuthRequired";
    case "subscription_error":
      return "subscriptionError";
    default:
      return "disabled";
  }
}

export function getBotStatusMessageKey(status: string) {
  switch (status) {
    case "active":
      return "active";
    case "active_offline_testing":
      return "activeOfflineTesting";
    case "waiting_for_live":
      return "waitingForLive";
    case "bot_auth_required":
      return "botAuthRequired";
    case "broadcaster_auth_required":
      return "broadcasterAuthRequired";
    case "subscription_error":
      return "subscriptionError";
    default:
      return "disabled";
  }
}
