// Route: Returns public RockSniffer addon release metadata for update checks.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { buildRockSnifferAddonManifest } from "~/lib/rocksniffer/integration";
import { json } from "~/lib/utils";

const rockSnifferCorsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function withRockSnifferCors(response: Response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(rockSnifferCorsHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/integrations/rocksniffer/addon")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: rockSnifferCorsHeaders,
        }),
      GET: async () => {
        const runtimeEnv = env as AppEnv;

        return withRockSnifferCors(
          json(buildRockSnifferAddonManifest(runtimeEnv.APP_URL))
        );
      },
    },
  },
});
