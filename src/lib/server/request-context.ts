import { getStartContext } from "@tanstack/start-storage-context";

export type AppRequestContext = {
  cloudflare?: {
    waitUntil?: (promise: Promise<unknown>) => void;
  };
};

export function getAppRequestContext() {
  const startContext = getStartContext({ throwIfNotFound: false });

  return (startContext?.contextAfterGlobalMiddlewares ??
    null) as AppRequestContext | null;
}

export function getRequestWaitUntil() {
  return getAppRequestContext()?.cloudflare?.waitUntil;
}
