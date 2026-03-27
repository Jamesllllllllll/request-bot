import type { AppEnv } from "~/lib/env";

const extensionJwtRoles = new Set(["broadcaster", "moderator", "viewer"]);
const encoder = new TextEncoder();

type ExtensionJwtPayload = {
  channel_id?: unknown;
  exp?: unknown;
  is_unlinked?: unknown;
  opaque_user_id?: unknown;
  role?: unknown;
  user_id?: unknown;
};

export type ExtensionAuthContext = {
  token: string;
  channelId: string;
  role: "broadcaster" | "moderator" | "viewer";
  viewerUserId: string | null;
  opaqueUserId: string | null;
  isLinked: boolean;
  exp: number;
};

export class ExtensionAuthError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ExtensionAuthError";
  }
}

export async function requireExtensionAuthFromRequest(input: {
  env: Pick<AppEnv, "TWITCH_EXTENSION_SECRET">;
  request: Request;
}) {
  const token = readExtensionToken(input.request);
  if (!token) {
    throw new ExtensionAuthError(401, "Missing Twitch extension token.");
  }

  const configuredSecrets =
    typeof input.env.TWITCH_EXTENSION_SECRET === "string"
      ? input.env.TWITCH_EXTENSION_SECRET
      : "";
  const secrets = configuredSecrets
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!secrets.length) {
    throw new ExtensionAuthError(
      500,
      "Twitch extension auth is not configured."
    );
  }

  let lastError: Error | null = null;

  for (const secret of secrets) {
    try {
      return await verifyExtensionJwt({ token, sharedSecret: secret });
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Token verification failed.");
    }
  }

  throw new ExtensionAuthError(
    401,
    lastError?.message ?? "Invalid Twitch extension token."
  );
}

export async function verifyExtensionJwt(input: {
  token: string;
  sharedSecret: string;
}): Promise<ExtensionAuthContext> {
  const parts = input.token.split(".");
  if (parts.length !== 3) {
    throw new ExtensionAuthError(401, "Invalid Twitch extension token.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg?: unknown; typ?: unknown }>(encodedHeader);

  if (header.alg !== "HS256") {
    throw new ExtensionAuthError(
      401,
      "Unsupported Twitch extension token algorithm."
    );
  }

  const verified = await verifySignature({
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: encodedSignature,
    sharedSecret: input.sharedSecret,
  });

  if (!verified) {
    throw new ExtensionAuthError(401, "Invalid Twitch extension token.");
  }

  const payload = decodeJson<ExtensionJwtPayload>(encodedPayload);
  const channelId =
    typeof payload.channel_id === "string" ? payload.channel_id.trim() : "";
  const role =
    typeof payload.role === "string" && extensionJwtRoles.has(payload.role)
      ? (payload.role as ExtensionAuthContext["role"])
      : null;
  const exp = normalizeNumber(payload.exp);
  const viewerUserId =
    typeof payload.user_id === "string" && payload.user_id.trim()
      ? payload.user_id.trim()
      : null;
  const opaqueUserId =
    typeof payload.opaque_user_id === "string" && payload.opaque_user_id.trim()
      ? payload.opaque_user_id.trim()
      : null;
  const isUnlinked = normalizeBoolean(payload.is_unlinked);

  if (!channelId) {
    throw new ExtensionAuthError(401, "Missing channel ID in extension token.");
  }

  if (!role) {
    throw new ExtensionAuthError(401, "Missing role in extension token.");
  }

  if (exp == null) {
    throw new ExtensionAuthError(401, "Missing expiration in extension token.");
  }

  if (exp <= Math.floor(Date.now() / 1000)) {
    throw new ExtensionAuthError(401, "Twitch extension token has expired.");
  }

  return {
    token: input.token,
    channelId,
    role,
    viewerUserId,
    opaqueUserId,
    isLinked: !!viewerUserId && !isUnlinked,
    exp,
  };
}

function readExtensionToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const headerToken = request.headers.get("x-extension-jwt")?.trim();
  return headerToken || null;
}

async function verifySignature(input: {
  signingInput: string;
  signature: string;
  sharedSecret: string;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(input.sharedSecret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(input.signature),
    encoder.encode(input.signingInput)
  );
}

function decodeJson<T>(segment: string) {
  try {
    const bytes = decodeBase64Url(segment);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ExtensionAuthError(401, "Invalid Twitch extension token.");
  }
}

function decodeBase64Url(input: string) {
  return decodeBase64(input.replace(/-/g, "+").replace(/_/g, "/"));
}

function decodeBase64(input: string) {
  const normalized = input.padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    "="
  );
  return Uint8Array.from(Buffer.from(normalized, "base64"));
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return false;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
