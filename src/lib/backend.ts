import type { AppEnv } from "./env";
import { withInternalApiSecret } from "./internal-api";
import { getErrorMessage } from "./utils";

export async function callBackend(
  env: AppEnv,
  pathname: string,
  init?: RequestInit
) {
  const request = new Request(
    `http://backend${pathname}`,
    withInternalApiSecret(env, init)
  );
  const response = await env.BACKEND_SERVICE.fetch(request);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = `Backend request failed: ${response.status}`;

    if (body) {
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        message = `${message} ${body}`;
      }
    }

    throw new Error(
      getErrorMessage(message, `Backend request failed: ${response.status}`)
    );
  }

  return response;
}
