import type { AppEnv, BackendEnv } from "~/lib/env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TWITCH_TOKEN_FORMAT_VERSION = "twtok:v1";
const TWITCH_TOKEN_IV_BYTES = 12;

type TokenEncryptionEnv = Pick<
  AppEnv | BackendEnv,
  "TWITCH_CLIENT_SECRET" | "TWITCH_TOKEN_ENCRYPTION_SECRET"
>;

type StoredTokenParts = {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

const keyCache = new Map<string, Promise<CryptoKey>>();

export type ReadStoredTwitchTokenResult = {
  value: string;
  needsReencryption: boolean;
};

export function isEncryptedTwitchToken(token: string | null | undefined) {
  return (
    typeof token === "string" &&
    token.startsWith(`${TWITCH_TOKEN_FORMAT_VERSION}:`)
  );
}

export async function encryptTwitchToken(
  env: TokenEncryptionEnv,
  token: string
) {
  const iv = crypto.getRandomValues(new Uint8Array(TWITCH_TOKEN_IV_BYTES));
  const key = await getPrimaryEncryptionKey(env);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(token)
  );

  return [
    TWITCH_TOKEN_FORMAT_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(new Uint8Array(ciphertext)),
  ].join(":");
}

export async function decryptTwitchToken(
  env: TokenEncryptionEnv,
  token: string
) {
  const result = await readStoredTwitchToken(env, token);
  return result.value;
}

export async function readStoredTwitchToken(
  env: TokenEncryptionEnv,
  token: string
): Promise<ReadStoredTwitchTokenResult> {
  if (!isEncryptedTwitchToken(token)) {
    return {
      value: token,
      needsReencryption: true,
    };
  }

  const parts = parseStoredTokenParts(token);
  const secrets = getTokenDecryptionSecrets(env);

  for (let index = 0; index < secrets.length; index += 1) {
    try {
      const key = await getEncryptionKey(secrets[index]);
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: parts.iv,
        },
        key,
        parts.ciphertext
      );

      return {
        value: decoder.decode(plaintext),
        needsReencryption: index !== 0,
      };
    } catch {}
  }

  throw new Error("Unable to decrypt stored Twitch token.");
}

function getTokenEncryptionSecret(env: TokenEncryptionEnv) {
  const configuredSecrets = env.TWITCH_TOKEN_ENCRYPTION_SECRET.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configuredSecrets.length) {
    throw new Error("Twitch token encryption is not configured.");
  }

  return configuredSecrets[0];
}

function getTokenDecryptionSecrets(env: TokenEncryptionEnv) {
  const secrets = [getTokenEncryptionSecret(env)];
  const legacySecret = env.TWITCH_CLIENT_SECRET.trim();

  if (legacySecret && !secrets.includes(legacySecret)) {
    secrets.push(legacySecret);
  }

  return secrets;
}

async function getPrimaryEncryptionKey(env: TokenEncryptionEnv) {
  return getEncryptionKey(getTokenEncryptionSecret(env));
}

async function getEncryptionKey(secret: string) {
  const cached = keyCache.get(secret);
  if (cached) {
    return cached;
  }

  const keyPromise = createEncryptionKey(secret);
  keyCache.set(secret, keyPromise);
  return keyPromise;
}

async function createEncryptionKey(secret: string) {
  const rawKey = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function parseStoredTokenParts(token: string): StoredTokenParts {
  const [format, version, encodedIv, encodedCiphertext] = token.split(":");
  if (
    format !== "twtok" ||
    version !== "v1" ||
    !encodedIv ||
    !encodedCiphertext
  ) {
    throw new Error("Invalid stored Twitch token format.");
  }

  return {
    iv: toArrayBuffer(decodeBase64Url(encodedIv)),
    ciphertext: toArrayBuffer(decodeBase64Url(encodedCiphertext)),
  };
}

function encodeBase64Url(value: Uint8Array) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

function toArrayBuffer(value: Uint8Array) {
  return copyBytes(value).buffer;
}

function copyBytes(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}
