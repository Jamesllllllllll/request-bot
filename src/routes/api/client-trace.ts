import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { serializeErrorForLog } from "~/lib/server/request-tracing";

const clientTraceSchema = z.object({
  sessionId: z.string().trim().min(1).max(100),
  sequence: z.number().int().min(1).max(100_000),
  event: z.string().trim().min(1).max(120),
  source: z.string().trim().max(80).optional(),
  fromUrl: z.string().trim().max(2000).nullable().optional(),
  toUrl: z.string().trim().max(2000).nullable().optional(),
  url: z.string().trim().max(2000).nullable().optional(),
  occurredAt: z.number().int().min(0),
  visibilityState: z.string().trim().max(40).optional(),
  historyLength: z.number().int().min(0).max(500).optional(),
  navigationType: z.string().trim().max(40).optional(),
  detail: z.string().trim().max(400).optional(),
  message: z.string().trim().max(1000).optional(),
  channelId: z.string().trim().max(100).nullable().optional(),
  status: z.number().int().min(100).max(599).nullable().optional(),
  connected: z.boolean().nullable().optional(),
  isLinked: z.boolean().nullable().optional(),
  helperState: z.string().trim().max(40).nullable().optional(),
});

export const Route = createFileRoute("/api/client-trace")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const path = new URL(request.url).pathname;

        try {
          const payload = clientTraceSchema.parse(await request.json());

          console.info("Client navigation trace", {
            path,
            sessionId: payload.sessionId,
            sequence: payload.sequence,
            event: payload.event,
            source: payload.source ?? null,
            fromUrl: payload.fromUrl ?? null,
            toUrl: payload.toUrl ?? null,
            url: payload.url ?? null,
            occurredAt: payload.occurredAt,
            visibilityState: payload.visibilityState ?? null,
            historyLength: payload.historyLength ?? null,
            navigationType: payload.navigationType ?? null,
            detail: payload.detail ?? null,
            message: payload.message ?? null,
            channelId: payload.channelId ?? null,
            status: payload.status ?? null,
            connected: payload.connected ?? null,
            isLinked: payload.isLinked ?? null,
            helperState: payload.helperState ?? null,
            userAgent: request.headers.get("user-agent") ?? null,
          });

          return new Response(null, { status: 204 });
        } catch (error) {
          console.error("Client navigation trace failed", {
            path,
            error: serializeErrorForLog(error),
          });

          return new Response(null, { status: 400 });
        }
      },
    },
  },
});
