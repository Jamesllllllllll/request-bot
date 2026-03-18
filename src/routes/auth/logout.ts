// Route: Signs the current user out and clears the local session.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie, destroySession } from "~/lib/auth/session.server";
import type { AppEnv } from "~/lib/env";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        await destroySession(request, runtimeEnv);

        return new Response(null, {
          status: 302,
          headers: {
            location: "/",
            "set-cookie": clearSessionCookie(runtimeEnv),
          },
        });
      },
    },
  },
});
