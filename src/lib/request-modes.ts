export type RequestMode = "catalog" | "random" | "choice";

export const STREAMER_CHOICE_WARNING_CODE = "streamer_choice";
export const STREAMER_CHOICE_TITLE = "Streamer choice";

const requestPathModifierMap: Record<string, string> = {
  "*guitar": "guitar",
  "*lead": "lead",
  "*rhythm": "rhythm",
  "*bass": "bass",
};

const ignoredPathModifiers = new Set(["*voice", "*vocals", "*lyrics"]);

export function parseRequestModifiers(
  query: string,
  options?: {
    allowPathModifiers?: boolean;
    allowedPathModifiers?: readonly string[];
  }
) {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const keptTokens: string[] = [];
  let hasRandomModifier = false;
  let hasChoiceModifier = false;
  let ignoredOfficialModifier = false;
  const requestedPaths: string[] = [];
  const hasConfiguredPathModifiers =
    options?.allowPathModifiers !== undefined ||
    options?.allowedPathModifiers !== undefined;
  const allowedPathModifiers = new Set(
    options?.allowedPathModifiers?.map((path) => path.trim().toLowerCase()) ??
      (options?.allowPathModifiers ? Object.values(requestPathModifierMap) : [])
  );

  for (const token of tokens) {
    const normalized = token.toLowerCase();

    if (normalized === "*random") {
      hasRandomModifier = true;
      continue;
    }

    if (normalized === "*choice" || normalized === "*any") {
      hasChoiceModifier = true;
      continue;
    }

    if (normalized === "*official") {
      ignoredOfficialModifier = true;
      continue;
    }

    if (requestPathModifierMap[normalized]) {
      const requestedPath = requestPathModifierMap[normalized];
      if (allowedPathModifiers.has(requestedPath)) {
        requestedPaths.push(requestedPath);
      }
      if (hasConfiguredPathModifiers) {
        continue;
      }
    }

    if (ignoredPathModifiers.has(normalized) && hasConfiguredPathModifiers) {
      continue;
    }

    keptTokens.push(token);
  }

  return {
    query: keptTokens.join(" ").trim(),
    mode: hasChoiceModifier
      ? ("choice" as const)
      : hasRandomModifier
        ? ("random" as const)
        : ("catalog" as const),
    hasRandomModifier,
    hasChoiceModifier,
    ignoredOfficialModifier,
    requestedPaths: [...new Set(requestedPaths)],
  };
}

export function isStreamerChoiceRequest(input: {
  warningCode?: string | null;
}) {
  return input.warningCode === STREAMER_CHOICE_WARNING_CODE;
}
