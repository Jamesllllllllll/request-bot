import { parseRequestModifiers } from "./request-modes";
import {
  type ChannelRequestSettings,
  getAllowedRequestPathsSetting,
  getRequiredVipTokenCostForRequestedPaths,
  normalizeAllowedRequestPaths,
  normalizeRequestPathModifier,
  requestPathModifierOptions,
  songSupportsRequestedPath,
} from "./request-policy";
import {
  getEffectiveVipTokenCost,
  getRequiredVipTokenCostForSong,
  type VipTokenDurationThreshold,
} from "./vip-token-duration-thresholds";

export const requestPathOptions = requestPathModifierOptions;

export type RequestPathOption = (typeof requestPathOptions)[number];

export function normalizeRequestedPath(
  value: string | null | undefined
): RequestPathOption | null {
  return normalizeRequestPathModifier(value);
}

export function getAvailableRequestedPaths(
  parts: string[] | null | undefined,
  allowedPaths?: string[] | null | undefined
): RequestPathOption[] {
  const available = new Set<RequestPathOption>();
  const normalizedAllowedPaths =
    allowedPaths == null ? null : normalizeAllowedRequestPaths(allowedPaths);

  for (const path of requestPathOptions) {
    if (
      normalizedAllowedPaths != null &&
      !normalizedAllowedPaths.includes(path)
    ) {
      continue;
    }

    if (songSupportsRequestedPath(parts, path)) {
      available.add(path);
    }
  }

  return requestPathOptions.filter((path) => available.has(path));
}

export function getStoredRequestedPaths(input: {
  requestedQuery?: string | null;
}) {
  return parseRequestModifiers(input.requestedQuery?.trim() ?? "", {
    allowedPathModifiers: requestPathOptions,
  }).requestedPaths;
}

export function getPrimaryRequestedPath(input: {
  requestedQuery?: string | null;
}) {
  return normalizeRequestedPath(getStoredRequestedPaths(input)[0] ?? null);
}

export function requestedPathsMatch(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every((path, index) => path === normalizedRight[index]);
}

export function buildRequestedPathQuery(requestedPaths: string[]) {
  const normalizedPaths = requestedPaths
    .map((path) => normalizeRequestedPath(path))
    .filter((path): path is RequestPathOption => path != null);

  if (normalizedPaths.length === 0) {
    return undefined;
  }

  return normalizedPaths.map((path) => `*${path}`).join(" ");
}

export function getRequestPathModifierUsesVipPriority(
  value: boolean | null | undefined
) {
  return value !== false;
}

export function getRequestVipTokenPlan(input: {
  requestKind: "regular" | "vip";
  explicitVipTokenCost?: number | null;
  song?: {
    durationSeconds?: number | null;
    durationText?: string | null;
  } | null;
  requestedPaths: string[];
  thresholds: VipTokenDurationThreshold[];
  settings: Pick<ChannelRequestSettings, "requestPathModifierVipTokenCost"> & {
    allowRequestPathModifiers?: boolean;
    allowedRequestPathsJson?: string | null;
    requestPathModifierUsesVipPriority?: boolean | null;
  };
}) {
  const normalizedSettings = {
    allowRequestPathModifiers:
      input.settings.allowRequestPathModifiers ?? false,
    allowedRequestPathsJson: input.settings.allowedRequestPathsJson ?? null,
    requestPathModifierVipTokenCost:
      input.settings.requestPathModifierVipTokenCost,
    requestPathModifierUsesVipPriority:
      input.settings.requestPathModifierUsesVipPriority,
  };
  const allowedRequestPaths = getAllowedRequestPathsSetting(normalizedSettings);
  const effectiveRequestedPaths = normalizeAllowedRequestPaths(
    input.requestedPaths
  ).filter((path) => allowedRequestPaths.includes(path));
  const requestedPathVipTokenCost = getRequiredVipTokenCostForRequestedPaths({
    requestedPaths: effectiveRequestedPaths,
    settings: normalizedSettings,
  });
  const requiredSongVipTokenCost = getRequiredVipTokenCostForSong(
    input.song,
    input.thresholds
  );
  const pathSelectionUsesVipPriority = getRequestPathModifierUsesVipPriority(
    normalizedSettings.requestPathModifierUsesVipPriority
  );
  const regularRequestRequiresVip =
    requiredSongVipTokenCost > 0 ||
    (pathSelectionUsesVipPriority && requestedPathVipTokenCost > 0);

  if (input.requestKind !== "vip") {
    return {
      requestedPathVipTokenCost,
      requiredSongVipTokenCost,
      pathSelectionUsesVipPriority,
      regularRequestRequiresVip,
      totalVipTokenCost: regularRequestRequiresVip
        ? 0
        : requestedPathVipTokenCost,
    };
  }

  const baseVipTokenCost = getEffectiveVipTokenCost({
    requestKind: "vip",
    explicitVipTokenCost: input.explicitVipTokenCost,
    song: input.song,
    thresholds: input.thresholds,
    minimumVipTokenCost: requiredSongVipTokenCost,
  });

  return {
    requestedPathVipTokenCost,
    requiredSongVipTokenCost,
    pathSelectionUsesVipPriority,
    regularRequestRequiresVip,
    totalVipTokenCost: pathSelectionUsesVipPriority
      ? Math.max(baseVipTokenCost, requestedPathVipTokenCost)
      : baseVipTokenCost + requestedPathVipTokenCost,
  };
}
