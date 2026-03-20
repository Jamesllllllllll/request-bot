import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function json<T>(data: T, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong."
) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

export async function sha256(input: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtmlEntities(input: string | null | undefined) {
  if (!input) {
    return input ?? "";
  }

  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return namedHtmlEntities[normalized] ?? match;
  });
}

export function encodeHtmlEntities(input: string | null | undefined) {
  if (!input) {
    return input ?? "";
  }

  return input
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#039;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function hexToRgba(hex: string, opacityPercent: number) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(100, opacityPercent)) / 100;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function parseJsonStringArray(input: string | null | undefined) {
  if (!input) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(input) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

const CUSTOMSFORGE_IGNITION_BASE_URL = "https://ignition4.customsforge.com";

export function normalizeSongSourceUrl(input: {
  source?: string | null;
  sourceUrl?: string | null;
  sourceId?: number | null;
}) {
  const sourceId = input.sourceId ?? null;

  if (sourceId != null) {
    return `${CUSTOMSFORGE_IGNITION_BASE_URL}/cdlc/${sourceId}`;
  }

  return input.sourceUrl?.trim() || undefined;
}
