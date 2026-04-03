import { describe, expect, it, vi } from "vitest";
import {
  createOauthStateCookie,
  verifyOauthState,
} from "~/lib/auth/session.server";
import type { AppEnv } from "~/lib/env";

function createSessionKv() {
  const store = new Map<string, string>();

  return {
    store,
    namespace: {
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    } as unknown as KVNamespace,
  };
}

describe("verifyOauthState", () => {
  it("accepts state only when both cookie and KV entry match", async () => {
    const sessionKv = createSessionKv();
    const env = {
      APP_URL: "https://example.com",
      SESSION_SECRET: "session-secret",
      SESSION_KV: sessionKv.namespace,
    } as AppEnv;
    const { state, cookie } = await createOauthStateCookie(env);
    const request = new Request("https://example.com/auth/twitch/callback", {
      headers: {
        cookie,
      },
    });

    await expect(verifyOauthState(request, env, state)).resolves.toBe(true);
    expect(sessionKv.store.has(`oauth:${state}`)).toBe(false);
  });

  it("rejects state when the initiating browser cookie is missing", async () => {
    const sessionKv = createSessionKv();
    const env = {
      APP_URL: "https://example.com",
      SESSION_SECRET: "session-secret",
      SESSION_KV: sessionKv.namespace,
    } as AppEnv;
    const { state } = await createOauthStateCookie(env);
    const request = new Request("https://example.com/auth/twitch/callback");

    await expect(verifyOauthState(request, env, state)).resolves.toBe(false);
    expect(sessionKv.store.has(`oauth:${state}`)).toBe(true);
  });

  it("rejects state when the server-side nonce is missing", async () => {
    const sessionKv = createSessionKv();
    const env = {
      APP_URL: "https://example.com",
      SESSION_SECRET: "session-secret",
      SESSION_KV: sessionKv.namespace,
    } as AppEnv;
    const { state, cookie } = await createOauthStateCookie(env);
    sessionKv.store.delete(`oauth:${state}`);
    const request = new Request("https://example.com/auth/twitch/callback", {
      headers: {
        cookie,
      },
    });

    await expect(verifyOauthState(request, env, state)).resolves.toBe(false);
  });
});
