var ADDON_ID = "rocklist_live_connector";
var ADDON_VERSION = "2026-04-17-1836";
var ADDON_MANIFEST_PATH = "/api/integrations/rocksniffer/addon";
var POLL_INTERVAL_MS = 900;
var CONNECTION_TIMEOUT_MS = POLL_INTERVAL_MS * 3;
var ADDON_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
var RELAY_FEEDBACK_TIMEOUT_MS = 3000;

var storage = null;
var poller = null;
var relayFeedbackTimeoutId = 0;
var state = {
  relayUrl: "",
  connected: false,
  lastDataAt: 0,
  currentStateLabel: "Waiting for RockSniffer",
  lastSong: null,
  lastSyncAt: null,
  relayFeedback: createRelayFeedbackState(false),
  sync: {
    tone: "warning",
    title: "Waiting",
    detail: "Complete setup to start syncing.",
  },
  addonRelease: createAddonReleaseState(),
  lastSongKey: "",
  lastSongAt: 0,
};

$(function () {
  storage = new SnifferStorage(ADDON_ID);

  bindEvents();
  restoreRelayUrl();
  startPoller();
  startAddonReleaseChecks();
  refreshConnectionState();
  window.setInterval(refreshConnectionState, 1000);
  render();
});

function createAddonReleaseState(input) {
  return {
    version: ADDON_VERSION,
    tone: input && input.tone ? input.tone : "",
    detail:
      input && input.detail
        ? input.detail
        : "Check runs after setup.",
    downloadUrl: input && input.downloadUrl ? input.downloadUrl : "",
  };
}

function createRelayFeedbackState(isSaved) {
  return isSaved
    ? {
        tone: "",
        message: "",
      }
    : {
        tone: "warning",
        message: "Relay URL not saved.",
      };
}

function syncIdleState() {
  if (state.relayUrl) {
    return {
      tone: "",
      title: "Ready",
      detail: "Waiting for the next song.",
    };
  }

  return {
    tone: "warning",
    title: "Waiting",
    detail: "Complete setup to start syncing.",
  };
}

function getDisplayedSyncState() {
  if (!state.relayUrl) {
    return syncIdleState();
  }

  return state.sync;
}

function bindEvents() {
  $("#relay-form").on("submit", function (event) {
    event.preventDefault();
    saveRelayUrl();
  });

  $("#clear-relay").on("click", function () {
    clearRelayUrl();
  });

  $("#relay-url").on("input", function () {
    renderRelayForm();
  });
}

function restoreRelayUrl() {
  storage
    .getValue("relayUrl")
    .done(function (value) {
      state.relayUrl = sanitizeRelayUrl(value);
      $("#relay-url").val(state.relayUrl);

      if (state.relayUrl) {
        state.relayFeedback = createRelayFeedbackState(true);
        state.sync = syncIdleState();
        checkAddonRelease(true);
      } else {
        state.relayFeedback = createRelayFeedbackState(false);
      }

      render();
    })
    .fail(function () {
      state.relayFeedback = createRelayFeedbackState(false);
      render();
    });
}

function saveRelayUrl() {
  var relayUrl = sanitizeRelayUrl($("#relay-url").val());

  if (!isValidRelayUrl(relayUrl)) {
    state.relayFeedback = {
      tone: "danger",
      message: "Enter a valid relay URL.",
    };
    render();
    return;
  }

  storage
    .setValue("relayUrl", relayUrl)
    .done(function () {
      state.relayUrl = relayUrl;
      $("#relay-url").val(state.relayUrl);
      state.relayFeedback = {
        tone: "success",
        message: "Saved.",
      };
      state.sync = syncIdleState();
      scheduleRelayFeedbackReset();
      checkAddonRelease(true);
      render();
    })
    .fail(function () {
      state.relayFeedback = {
        tone: "danger",
        message: "Could not save locally.",
      };
      render();
    });
}

function clearRelayUrl() {
  clearRelayFeedbackReset();
  storage
    .setValue("relayUrl", "")
    .always(function () {
      state.relayUrl = "";
      $("#relay-url").val("");
      state.relayFeedback = createRelayFeedbackState(false);
      state.addonRelease = createAddonReleaseState();
      state.sync = syncIdleState();
      render();
    });
}

function startPoller() {
  poller = new SnifferPoller({
    interval: POLL_INTERVAL_MS,
  });

  poller.onData(function (data) {
    state.lastDataAt = Date.now();
    state.currentStateLabel = getStateLabel(data.currentState);
    refreshConnectionState();
    updateSongFromReadout(data);
    render();
  });

  poller.onStateChanged(function (_oldState, nextState) {
    state.currentStateLabel = getStateLabel(nextState);
    render();
  });

  poller.onSongStarted(function (song) {
    handleSongStarted(song);
  });
}

function startAddonReleaseChecks() {
  window.setInterval(function () {
    checkAddonRelease(false);
  }, ADDON_UPDATE_CHECK_INTERVAL_MS);
}

function refreshConnectionState() {
  state.connected =
    state.lastDataAt > 0 && Date.now() - state.lastDataAt <= CONNECTION_TIMEOUT_MS;
  renderStatusCards();
}

function updateSongFromReadout(data) {
  if (!data || !data.songDetails) {
    return;
  }

  var arrangement = getCurrentArrangement();
  state.lastSong = buildDisplaySong({
    title: data.songDetails.songName,
    artist: data.songDetails.artistName,
    arrangement: arrangementName(arrangement),
    tuning: arrangementTuning(arrangement),
  });
}

function handleSongStarted(song) {
  state.lastDataAt = Date.now();
  refreshConnectionState();

  var arrangement = getCurrentArrangement();
  var payload = {
    event: "songStarted",
    observedAt: Date.now(),
    song: {
      id: normalizeString(song.songID),
      title: normalizeString(song.songName),
      artist: normalizeString(song.artistName),
      album: normalizeString(song.albumName),
      arrangement: arrangementName(arrangement),
      tuning: arrangementTuning(arrangement),
      lengthSeconds: normalizeNumber(song.songLength),
    },
  };

  state.lastSong = buildDisplaySong(payload.song);

  if (!payload.song.title || !payload.song.artist) {
    state.sync = {
      tone: "danger",
      title: "Error",
      detail: "Song details unavailable.",
    };
    render();
    return;
  }

  if (!state.relayUrl) {
    state.sync = {
      tone: "warning",
      title: "Waiting",
      detail: "Queue sync is not set up.",
    };
    render();
    return;
  }

  var songKey = buildSongKey(payload.song);
  if (
    songKey &&
    state.lastSongKey === songKey &&
    Date.now() - state.lastSongAt < 5000
  ) {
    return;
  }

  state.lastSongKey = songKey;
  state.lastSongAt = Date.now();
  state.sync = {
    tone: "",
    title: "Checking queue",
    detail: "Matching current queue item.",
  };
  render();

  $.ajax({
    method: "POST",
    url: state.relayUrl,
    crossDomain: true,
    contentType: "application/json",
    dataType: "json",
    data: JSON.stringify(payload),
  })
    .done(function (response) {
      state.lastSyncAt = Date.now();
      applyRelayResponse(response);
      render();
    })
    .fail(function (xhr) {
      state.sync = {
        tone: "danger",
        title: "Error",
        detail: extractRelayError(xhr),
      };
      render();
    });
}

function applyRelayResponse(response) {
  if (!response || typeof response !== "object") {
    state.sync = {
      tone: "danger",
      title: "Error",
      detail: "RockList.Live returned an unexpected response.",
    };
    return;
  }

  if (response.status === "current_updated") {
    state.sync = {
      tone: "success",
      title: "Current song updated",
      detail: response.message || "Queue updated.",
    };
    return;
  }

  if (response.status === "current_advanced_and_updated") {
    state.sync = {
      tone: "success",
      title: "Queue updated",
      detail:
        response.message ||
        "Previous current song marked played. Matching song is now playing.",
    };
    return;
  }

  if (response.status === "already_current") {
    state.sync = {
      tone: "success",
      title: "Already current",
      detail: response.message || "Already up to date.",
    };
    return;
  }

  if (response.status === "ignored_no_match") {
    state.sync = {
      tone: "warning",
      title: "No match",
      detail: response.message || "Queue unchanged.",
    };
    return;
  }

  if (response.status === "ignored_ambiguous") {
    state.sync = {
      tone: "warning",
      title: "More than one match",
      detail: response.message || "Queue unchanged.",
    };
    return;
  }

  state.sync = {
    tone: "",
    title: "Ready",
    detail: response.message || "Ready for the next song.",
  };
}

function render() {
  renderStatusCards();
  renderRelayForm();
  renderAddonRelease();
  renderLastSong();
}

function renderAddonRelease() {
  $("#addon-release-value").text(state.addonRelease.version);

  $("#addon-release-detail")
    .text(state.addonRelease.detail)
    .removeClass("is-success is-warning is-danger");

  if (state.addonRelease.tone) {
    $("#addon-release-detail").addClass("is-" + state.addonRelease.tone);
  }

  if (state.addonRelease.downloadUrl) {
    $("#addon-release-download").attr("href", state.addonRelease.downloadUrl);
    $("#addon-release-actions").removeClass("is-hidden");
  } else {
    $("#addon-release-download").attr("href", "#");
    $("#addon-release-actions").addClass("is-hidden");
  }
}

function renderStatusCards() {
  var displayedSync = getDisplayedSyncState();

  setStatusCard("rocksniffer", {
    title: state.connected ? "Connected" : "Waiting for data",
    detail: state.connected
      ? state.currentStateLabel === "Waiting for RockSniffer"
        ? "Rocksmith not running."
        : state.currentStateLabel
      : "Waiting for RockSniffer.",
    tone: state.connected ? "success" : "warning",
  });

  var syncDetail = displayedSync.detail;
  if (state.lastSyncAt) {
    syncDetail += " Last update: " + new Date(state.lastSyncAt).toLocaleTimeString();
  }

  setStatusCard("sync", {
    title: displayedSync.title,
    detail: syncDetail,
    tone: displayedSync.tone,
  });
}

function renderRelayForm() {
  var draftRelayUrl = sanitizeRelayUrl($("#relay-url").val());
  var relayUrlChanged = draftRelayUrl !== state.relayUrl;
  var canSaveRelayUrl = isValidRelayUrl(draftRelayUrl) && relayUrlChanged;

  $("#save-relay").prop("disabled", !canSaveRelayUrl);
  $("#clear-relay").prop("disabled", !state.relayUrl);

  $("#relay-feedback")
    .text(state.relayFeedback.message)
    .removeClass("is-success is-warning is-danger");

  if (state.relayFeedback.tone) {
    $("#relay-feedback").addClass("is-" + state.relayFeedback.tone);
  }
}

function renderLastSong() {
  var songCard = $(".song-card");
  var songTitle = $("#last-song-title");

  if (!state.lastSong) {
    songCard.addClass("is-empty");
    songTitle.addClass("is-empty").text("No song yet");
    $("#last-song-artist").text(
      state.connected
        ? "Start playing to see the current song."
        : "Waiting for RockSniffer."
    );
    $("#last-song-arrangement").text("");
    $("#last-song-state").text("");
    return;
  }

  songCard.removeClass("is-empty");
  songTitle.removeClass("is-empty").text(state.lastSong.title);
  $("#last-song-artist").text(state.lastSong.artist);
  $("#last-song-arrangement").text(state.lastSong.arrangementLine);
  $("#last-song-state").text(state.currentStateLabel);
}

function checkAddonRelease(force) {
  var manifestUrl = getAddonManifestUrl();

  if (!manifestUrl) {
    state.addonRelease = createAddonReleaseState();
    renderAddonRelease();
    return;
  }

  if (!force && state.addonRelease.detail === "Checking for updates.") {
    return;
  }

  var previousReleaseState = state.addonRelease;
  state.addonRelease = createAddonReleaseState({
    detail: "Checking for updates.",
    downloadUrl: previousReleaseState.downloadUrl,
  });
  renderAddonRelease();

  $.ajax({
    method: "GET",
    url: manifestUrl,
    crossDomain: true,
    dataType: "json",
  })
    .done(function (response) {
      applyAddonReleaseManifest(response);
      renderAddonRelease();
    })
    .fail(function () {
      state.addonRelease = createAddonReleaseState({
        tone: "warning",
        detail: "Could not check for updates.",
        downloadUrl: previousReleaseState.downloadUrl,
      });
      renderAddonRelease();
    });
}

function getAddonManifestUrl() {
  if (!isValidRelayUrl(state.relayUrl)) {
    return null;
  }

  try {
    return new URL(ADDON_MANIFEST_PATH, state.relayUrl).toString();
  } catch (_error) {
    return null;
  }
}

function applyAddonReleaseManifest(response) {
  var latest =
    response && response.latest && typeof response.latest === "object"
      ? response.latest
      : null;

  if (!latest || typeof latest.version !== "string") {
    state.addonRelease = createAddonReleaseState({
      tone: "warning",
      detail: "Could not read addon version info.",
    });
    return;
  }

  if (latest.version === ADDON_VERSION) {
    state.addonRelease = createAddonReleaseState({
      tone: "success",
      detail: "Up to date.",
    });
    return;
  }

  if (latest.version > ADDON_VERSION) {
    state.addonRelease = createAddonReleaseState({
      tone: "warning",
      detail: "Latest version: " + latest.version + ".",
      downloadUrl:
        typeof latest.downloadUrl === "string" ? latest.downloadUrl : "",
    });
    return;
  }

  state.addonRelease = createAddonReleaseState({
    detail: "Installed version is newer.",
  });
}

function clearRelayFeedbackReset() {
  if (!relayFeedbackTimeoutId) {
    return;
  }

  window.clearTimeout(relayFeedbackTimeoutId);
  relayFeedbackTimeoutId = 0;
}

function scheduleRelayFeedbackReset() {
  clearRelayFeedbackReset();
  relayFeedbackTimeoutId = window.setTimeout(function () {
    state.relayFeedback = createRelayFeedbackState(!!state.relayUrl);
    renderRelayForm();
    relayFeedbackTimeoutId = 0;
  }, RELAY_FEEDBACK_TIMEOUT_MS);
}

function setStatusCard(prefix, input) {
  $("#" + prefix + "-status").text(input.title);
  $("#" + prefix + "-detail").text(input.detail);

  var card = $("#" + prefix + "-status").closest(".status-card");
  card.removeClass("is-success is-warning is-danger");

  if (input.tone) {
    card.addClass("is-" + input.tone);
  }
}

function buildDisplaySong(song) {
  return {
    title: song.title || "Unknown song",
    artist: song.artist || "Unknown artist",
    arrangementLine: buildArrangementLine(song.arrangement, song.tuning),
  };
}

function buildArrangementLine(arrangement, tuning) {
  var parts = [];

  if (arrangement) {
    parts.push(arrangement);
  }

  if (tuning) {
    parts.push(tuning);
  }

  return parts.length > 0 ? parts.join(" • ") : "";
}

function getCurrentArrangement() {
  if (!poller || typeof poller.getCurrentArrangement !== "function") {
    return null;
  }

  try {
    return poller.getCurrentArrangement();
  } catch (_error) {
    return null;
  }
}

function arrangementName(arrangement) {
  if (!arrangement) {
    return null;
  }

  return normalizeString(arrangement.name || arrangement.type);
}

function arrangementTuning(arrangement) {
  if (!arrangement || !arrangement.tuning) {
    return null;
  }

  return normalizeString(arrangement.tuning.TuningName);
}

function getStateLabel(stateId) {
  if (stateId === STATE_IN_MENUS) {
    return "In menus";
  }

  if (stateId === STATE_SONG_SELECTED) {
    return "Song selected";
  }

  if (stateId === STATE_SONG_STARTING) {
    return "Song starting";
  }

  if (stateId === STATE_SONG_PLAYING) {
    return "Song playing";
  }

  if (stateId === STATE_SONG_ENDING) {
    return "Song ending";
  }

  return "Waiting for RockSniffer";
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }

  var trimmed = $.trim(value);
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value) {
  return typeof value === "number" && isFinite(value) ? value : null;
}

function sanitizeRelayUrl(value) {
  return $.trim(String(value || ""));
}

function isValidRelayUrl(value) {
  if (!value) {
    return false;
  }

  try {
    var parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function buildSongKey(song) {
  return [song.id || "", song.artist || "", song.title || ""].join("::");
}

function extractRelayError(xhr) {
  if (xhr && xhr.responseJSON && xhr.responseJSON.message) {
    return xhr.responseJSON.message;
  }

  if (xhr && xhr.responseText) {
    try {
      var parsed = JSON.parse(xhr.responseText);
      if (parsed && parsed.message) {
        return parsed.message;
      }
    } catch (_error) {
      return "Unreadable response.";
    }
  }

  if (xhr && xhr.status) {
    return "RockList.Live returned " + xhr.status + ".";
  }

  return "RockList.Live could not be reached.";
}
