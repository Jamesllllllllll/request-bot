import { json } from "~/lib/utils";
import { ExtensionAuthError } from "./extension-auth";
import { ExtensionPanelError } from "./extension-panel";
import { ViewerRequestError } from "./viewer-request";

const extensionCorsHeaderEntries = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, x-extension-jwt, x-extension-refresh-cause",
  "access-control-max-age": "86400",
};

export function extensionCorsPreflight() {
  return new Response(null, {
    status: 204,
    headers: extensionCorsHeaderEntries,
  });
}

export function withExtensionCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extensionCorsHeaderEntries)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function getExtensionErrorStatus(error: unknown) {
  if (
    error instanceof ExtensionAuthError ||
    error instanceof ExtensionPanelError ||
    error instanceof ViewerRequestError
  ) {
    return error.status;
  }

  return 500;
}

export function toExtensionErrorResponse(
  error: unknown,
  fallback = "Unable to handle the Twitch extension request."
) {
  if (
    error instanceof ExtensionAuthError ||
    error instanceof ExtensionPanelError ||
    error instanceof ViewerRequestError
  ) {
    return withExtensionCors(
      json({ error: error.message }, { status: error.status })
    );
  }

  return withExtensionCors(
    json(
      {
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : fallback,
      },
      { status: 500 }
    )
  );
}
