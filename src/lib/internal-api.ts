import type { AppEnv, BackendEnv } from "./env";

export const internalApiSecretHeaderName = "x-request-bot-internal-secret";

export function withInternalApiSecret(
  env: Pick<AppEnv, "INTERNAL_API_SECRET">,
  init?: RequestInit
) {
  const headers = new Headers(init?.headers);
  headers.set(internalApiSecretHeaderName, env.INTERNAL_API_SECRET);
  return {
    ...init,
    headers,
  } satisfies RequestInit;
}

export function hasValidInternalApiSecret(
  request: Request,
  env: Pick<BackendEnv, "INTERNAL_API_SECRET">
) {
  if (!env.INTERNAL_API_SECRET) {
    return false;
  }

  return (
    request.headers.get(internalApiSecretHeaderName) === env.INTERNAL_API_SECRET
  );
}
