function normalizeBaseUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\/+$/g, "");
  return normalized || null;
}

export function isTwitchHostedExtensionOrigin(origin?: string | null) {
  const normalized = normalizeBaseUrl(origin);
  if (!normalized) {
    return false;
  }

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "extension-files.twitch.tv" ||
      hostname.endsWith(".ext-twitch.tv")
    );
  } catch {
    return false;
  }
}

export function resolveExtensionApiBaseUrl(input: {
  explicitBaseUrl?: string | null;
  envBaseUrl?: string | null;
  windowOrigin?: string | null;
}) {
  const explicit = normalizeBaseUrl(input.explicitBaseUrl);
  if (explicit) {
    return explicit;
  }

  const windowOrigin = normalizeBaseUrl(input.windowOrigin);
  if (windowOrigin && !isTwitchHostedExtensionOrigin(windowOrigin)) {
    return windowOrigin;
  }

  const envBaseUrl = normalizeBaseUrl(input.envBaseUrl);
  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (windowOrigin) {
    return windowOrigin;
  }

  return "";
}

export function getExtensionApiBaseUrl(explicitBaseUrl?: string) {
  return resolveExtensionApiBaseUrl({
    explicitBaseUrl,
    envBaseUrl: import.meta.env.VITE_TWITCH_EXTENSION_API_BASE_URL,
    windowOrigin: typeof window !== "undefined" ? window.location.origin : null,
  });
}

export function toExtensionAppUrl(pathname: string, explicitBaseUrl?: string) {
  const baseUrl = getExtensionApiBaseUrl(explicitBaseUrl);
  if (!baseUrl) {
    return pathname;
  }

  return new URL(pathname, `${baseUrl}/`).toString();
}

export function toExtensionApiUrl(pathname: string, explicitBaseUrl?: string) {
  return toExtensionAppUrl(pathname, explicitBaseUrl);
}
