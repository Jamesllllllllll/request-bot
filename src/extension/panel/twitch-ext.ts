export type TwitchExtensionAuth = {
  channelId: string;
  clientId: string;
  token: string;
  helixToken?: string;
  userId?: string | null;
};

type TwitchExtensionHelper = {
  onAuthorized(callback: (auth: TwitchExtensionAuth) => void): void;
  actions: {
    requestIdShare(): void;
  };
};

declare global {
  interface Window {
    Twitch?: {
      ext?: TwitchExtensionHelper;
    };
  }
}

const helperScriptUrl =
  "https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js";

export async function loadTwitchExtensionHelper() {
  if (window.Twitch?.ext) {
    return window.Twitch.ext;
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    'script[data-twitch-extension-helper="true"]'
  );
  if (existingScript) {
    await waitForScript(existingScript);
    return window.Twitch?.ext ?? null;
  }

  const script = document.createElement("script");
  script.src = helperScriptUrl;
  script.async = true;
  script.dataset.twitchExtensionHelper = "true";
  document.head.appendChild(script);
  await waitForScript(script);

  return window.Twitch?.ext ?? null;
}

export function getTwitchExtensionHelper() {
  return window.Twitch?.ext ?? null;
}

function waitForScript(script: HTMLScriptElement) {
  return new Promise<void>((resolve, reject) => {
    if (window.Twitch?.ext) {
      resolve();
      return;
    }

    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load the Twitch extension helper."));
    };
    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
  });
}
