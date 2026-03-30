export const ADD_REQUESTS_WHEN_LIVE_MESSAGE =
  "You can add requests when the stream goes live.";

export function areChannelRequestsOpen(input: {
  isLive?: boolean | null;
  botReadyState?: string | null;
}) {
  return !!input.isLive || input.botReadyState === "active_offline_testing";
}
