export const tuningOptions = [
  "High F# Standard",
  "High F Standard",
  "E Standard",
  "Drop D",
  "Eb Standard",
  "Eb Drop Db",
  "D Standard",
  "D Drop C",
  "C# Standard",
  "C# Drop B",
  "C Standard",
  "C Drop Bb",
  "B Standard",
  "B Drop A",
  "Bb Standard",
  "Bb Drop Ab",
  "A Standard",
  "Ab Standard",
  "G Standard",
  "Low Gb Standard",
  "Low F Standard",
  "Octave",
  "Open A",
  "Open B",
  "Open C",
  "Open D",
  "Open E",
  "Open F",
  "Open G",
  "Celtic",
  "Other",
] as const;

export const pathOptions = ["lead", "rhythm", "bass"] as const;

export type PathOption = (typeof pathOptions)[number];

function normalizePathValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizePathOptions(
  paths: Array<string | null | undefined> | null | undefined
) {
  const normalized = new Set<PathOption>();

  for (const path of paths ?? []) {
    const normalizedPath = normalizePathValue(path);
    if (pathOptions.includes(normalizedPath as PathOption)) {
      normalized.add(normalizedPath as PathOption);
    }
  }

  return pathOptions.filter((path) => normalized.has(path));
}

export function isLyricsPart(value: string | null | undefined) {
  switch (normalizePathValue(value)) {
    case "lyrics":
    case "voice":
    case "vocals":
      return true;
    default:
      return false;
  }
}

export function hasLyricsMetadata(input: {
  hasLyrics?: boolean | null | undefined;
  hasVocals?: boolean | null | undefined;
  parts?: Array<string | null | undefined> | null | undefined;
}) {
  if (input.hasLyrics || input.hasVocals) {
    return true;
  }

  return (input.parts ?? []).some((part) => isLyricsPart(part));
}
