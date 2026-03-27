function normalizeBaseUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\/+$/g, "");
  return normalized || null;
}

export function getExtensionApiBaseUrl(explicitBaseUrl?: string) {
  const explicit = normalizeBaseUrl(explicitBaseUrl);
  if (explicit) {
    return explicit;
  }

  const envBaseUrl = normalizeBaseUrl(
    import.meta.env.VITE_TWITCH_EXTENSION_API_BASE_URL
  );
  if (envBaseUrl) {
    return envBaseUrl;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export function toExtensionApiUrl(pathname: string, explicitBaseUrl?: string) {
  const baseUrl = getExtensionApiBaseUrl(explicitBaseUrl);
  if (!baseUrl) {
    return pathname;
  }

  return new URL(pathname, `${baseUrl}/`).toString();
}
