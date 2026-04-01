import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { AppEnv } from "~/lib/env";
import {
  getViewerSessionData,
  type ViewerSessionData,
} from "~/lib/server/viewer-session-data";

export type { ViewerSessionData } from "~/lib/server/viewer-session-data";

export const getViewerSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<ViewerSessionData> => {
    const runtimeEnv = env as AppEnv;
    const request = getRequest();
    return getViewerSessionData(request, runtimeEnv);
  }
);
