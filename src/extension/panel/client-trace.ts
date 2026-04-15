const panelTraceSessionStorageKey = "navigation-trace-session-id";
const panelTraceSequenceStorageKey = "extension-panel-client-trace-sequence";

function getCurrentPanelUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getPanelTraceSessionId() {
  const existingSessionId = window.sessionStorage.getItem(
    panelTraceSessionStorageKey
  );
  if (existingSessionId) {
    return existingSessionId;
  }

  const nextSessionId = crypto.randomUUID();
  window.sessionStorage.setItem(panelTraceSessionStorageKey, nextSessionId);
  return nextSessionId;
}

function getNextPanelTraceSequence() {
  const currentValue = Number.parseInt(
    window.sessionStorage.getItem(panelTraceSequenceStorageKey) ?? "0",
    10
  );
  const nextValue = Number.isFinite(currentValue) ? currentValue + 1 : 1;
  window.sessionStorage.setItem(
    panelTraceSequenceStorageKey,
    String(nextValue)
  );
  return nextValue;
}

export function emitExtensionPanelClientTrace(input: {
  event: string;
  detail?: string;
  message?: string;
  channelId?: string | null;
  status?: number | null;
  connected?: boolean | null;
  isLinked?: boolean | null;
  helperState?: string | null;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    sessionId: getPanelTraceSessionId(),
    sequence: getNextPanelTraceSequence(),
    event: input.event,
    source: "extension-panel",
    url: getCurrentPanelUrl(),
    occurredAt: Date.now(),
    visibilityState: document.visibilityState,
    historyLength: window.history.length,
    detail: input.detail,
    message: input.message,
    channelId: input.channelId ?? null,
    status: input.status ?? null,
    connected: input.connected ?? null,
    isLinked: input.isLinked ?? null,
    helperState: input.helperState ?? null,
  };

  void fetch("/api/client-trace", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}
