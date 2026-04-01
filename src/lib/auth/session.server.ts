import type { AppEnv } from "~/lib/env";
import { localeCookieMaxAgeSeconds, localeCookieName } from "~/lib/i18n/config";
import { createId, sha256 } from "~/lib/utils";

const sessionCookieName = "rb_session";
const oauthStateCookieName = "rb_oauth_state";

function parseCookie(request: Request, cookieName: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return null;
  }

  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export async function createSession(env: AppEnv, userId: string) {
  const sessionId = createId("sess");
  await env.SESSION_KV.put(`session:${sessionId}`, JSON.stringify({ userId }), {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  return sessionId;
}

function secureFlag(env: AppEnv) {
  return env.APP_URL.startsWith("https://") ? " Secure;" : "";
}

function oauthSameSite(env: AppEnv) {
  return env.APP_URL.startsWith("https://") ? "None" : "Lax";
}

export async function getSessionUserId(request: Request, env: AppEnv) {
  const sessionId = parseCookie(request, sessionCookieName);

  if (!sessionId) {
    return null;
  }

  const payload = await env.SESSION_KV.get(`session:${sessionId}`, "json");
  return payload && typeof payload === "object" && "userId" in payload
    ? String(payload.userId)
    : null;
}

export async function destroySession(request: Request, env: AppEnv) {
  const sessionId = parseCookie(request, sessionCookieName);

  if (!sessionId) {
    return;
  }

  await env.SESSION_KV.delete(`session:${sessionId}`);
}

export function buildSessionCookie(sessionId: string, env: AppEnv) {
  return `${sessionCookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax;${secureFlag(env)} Max-Age=2592000`;
}

export function clearSessionCookie(env: AppEnv) {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax;${secureFlag(env)} Max-Age=0`;
}

export function getLocaleCookie(request: Request) {
  return parseCookie(request, localeCookieName);
}

export function buildLocaleCookie(locale: string, env: AppEnv) {
  return `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; SameSite=Lax;${secureFlag(env)} Max-Age=${localeCookieMaxAgeSeconds}`;
}

export function clearLocaleCookie(env: AppEnv) {
  return `${localeCookieName}=; Path=/; SameSite=Lax;${secureFlag(env)} Max-Age=0`;
}

export async function createOauthStateCookie(env: AppEnv) {
  const state = createId("oauth");
  const signature = await sha256(`${state}:${env.SESSION_SECRET}`);
  await env.SESSION_KV.put(`oauth:${state}`, signature, {
    expirationTtl: 60 * 15,
  });
  return {
    state,
    cookie: `${oauthStateCookieName}=${encodeURIComponent(`${state}.${signature}`)}; Path=/; HttpOnly; SameSite=${oauthSameSite(env)};${secureFlag(env)} Max-Age=900`,
  };
}

export async function verifyOauthState(
  request: Request,
  env: AppEnv,
  state: string
) {
  const raw = parseCookie(request, oauthStateCookieName);
  const storedSignature = await env.SESSION_KV.get(`oauth:${state}`);
  const expected = await sha256(`${state}:${env.SESSION_SECRET}`);

  const cookieValid = (() => {
    if (!raw) {
      return false;
    }

    const [storedState, signature] = raw.split(".");
    return storedState === state && signature === expected;
  })();

  const kvValid = storedSignature === expected;
  if (!cookieValid && !kvValid) {
    return false;
  }

  await env.SESSION_KV.delete(`oauth:${state}`);
  return true;
}

export function clearOauthStateCookie(env: AppEnv) {
  return `${oauthStateCookieName}=; Path=/; HttpOnly; SameSite=${oauthSameSite(env)};${secureFlag(env)} Max-Age=0`;
}
