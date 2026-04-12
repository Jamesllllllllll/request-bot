import {
  type PlaylistStreamNotifyReason,
  parseExtensionPlaylistPubSubMessage,
} from "~/lib/playlist/realtime";

export function parseExtensionPanelPubSubMessage(input: {
  contentType: string;
  message: string;
}) {
  if (input.contentType !== "application/json") {
    return null;
  }

  return parseExtensionPlaylistPubSubMessage(input.message);
}

export function shouldRefreshPanelSearchFromPubSub(
  reason: PlaylistStreamNotifyReason
) {
  return reason === "settings" || reason === "blacklist";
}
