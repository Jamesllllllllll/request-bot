export type RequestMode = "catalog" | "random" | "choice";

export const STREAMER_CHOICE_WARNING_CODE = "streamer_choice";
export const STREAMER_CHOICE_TITLE = "Streamer choice";

const requestPathModifierMap: Record<string, string> = {
  "*bass": "bass",
};

const ignoredPathModifiers = new Set([
  "*lead",
  "*rhythm",
  "*voice",
  "*vocals",
  "*lyrics",
]);

export function parseRequestModifiers(
  query: string,
  options?: { allowPathModifiers?: boolean }
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

    if (options?.allowPathModifiers && requestPathModifierMap[normalized]) {
      requestedPaths.push(requestPathModifierMap[normalized]);
      continue;
    }

    if (options?.allowPathModifiers && ignoredPathModifiers.has(normalized)) {
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
