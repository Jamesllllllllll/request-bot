const twitchPlayerScriptUrl = "https://player.twitch.tv/js/embed/v1.js";

export type TwitchPlayerOptions = {
  channel: string;
  parent: string[];
  width: number | string;
  height: number | string;
  autoplay?: boolean;
  muted?: boolean;
};

export type TwitchPlayerInstance = {
  addEventListener(eventName: string, handler: () => void): void;
  play(): void;
  setMuted(muted: boolean): void;
};

export type TwitchPlayerConstructor = (new (
  elementId: string,
  options: TwitchPlayerOptions
) => TwitchPlayerInstance) & {
  READY: string;
  PLAYING: string;
  PLAYBACK_BLOCKED: string;
};

type TwitchWindow = Window & {
  Twitch?: {
    Player?: TwitchPlayerConstructor;
  };
};

type TwitchPlayerScriptLoaderInput = {
  document?: Document;
  window?: TwitchWindow;
};

export function getTwitchEmbedParentHost(
  input: Pick<Location, "hostname"> | URL
) {
  const hostname = input.hostname.trim().toLowerCase();
  return hostname.length > 0 ? hostname : null;
}

export async function loadTwitchPlayerScript(
  input: TwitchPlayerScriptLoaderInput = {}
) {
  const win =
    input.window ??
    ((typeof window !== "undefined" ? window : undefined) as
      | TwitchWindow
      | undefined);
  const doc =
    input.document ?? (typeof document !== "undefined" ? document : undefined);

  if (!win || !doc) {
    throw new Error("Twitch player SDK can only load in a browser.");
  }

  const existingPlayer = win.Twitch?.Player;
  if (existingPlayer) {
    return existingPlayer;
  }

  const existingScript = doc.querySelector<HTMLScriptElement>(
    'script[data-twitch-player-script="true"]'
  );
  if (existingScript) {
    await waitForTwitchPlayerScript(existingScript, win);
    return getTwitchPlayerOrThrow(win);
  }

  const script = doc.createElement("script");
  script.src = twitchPlayerScriptUrl;
  script.async = true;
  script.dataset.twitchPlayerScript = "true";
  doc.head.appendChild(script);

  await waitForTwitchPlayerScript(script, win);
  return getTwitchPlayerOrThrow(win);
}

function getTwitchPlayerOrThrow(win: TwitchWindow) {
  const player = win.Twitch?.Player;
  if (!player) {
    throw new Error("Twitch player SDK loaded without exposing Twitch.Player.");
  }

  return player;
}

function waitForTwitchPlayerScript(
  script: HTMLScriptElement,
  win: TwitchWindow
) {
  return new Promise<void>((resolve, reject) => {
    if (win.Twitch?.Player) {
      resolve();
      return;
    }

    const handleLoad = () => {
      cleanup();
      if (win.Twitch?.Player) {
        resolve();
        return;
      }

      reject(
        new Error("Twitch player SDK loaded without exposing Twitch.Player.")
      );
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load the Twitch player SDK."));
    };
    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
  });
}
