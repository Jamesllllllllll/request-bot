import { parseRequestModifiers } from "./request-modes";
import {
  type ChannelRequestSettings,
  getAllowedRequestPathsSetting,
  getRequestPathModifierUsesVipPrioritySetting,
  getRequiredVipTokenCostDetailsForRequestedPaths,
  getRequiredVipTokenCostForRequestedPaths,
  normalizeAllowedRequestPaths,
  normalizeRequestPathModifier,
  requestPathModifierOptions,
  songSupportsRequestedPath,
} from "./request-policy";
import {
  getMatchedVipTokenDurationThresholdForSong,
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

export type RequestVipTokenPlanReason =
  | {
      type: "base_vip";
      cost: number;
    }
  | {
      type: "duration";
      cost: number;
      minimumDurationMinutes: number;
    }
  | {
      type: "requested_path";
      cost: number;
      path: RequestPathOption;
    }
  | {
      type: "explicit_vip";
      cost: number;
    };

export function getRequestVipTokenPlan(input: {
  requestKind: "regular" | "vip";
  explicitVipTokenCost?: number | null;
  song?: {
    durationSeconds?: number | null;
    durationText?: string | null;
  } | null;
  requestedPaths: string[];
  thresholds: VipTokenDurationThreshold[];
  settings: Pick<
    ChannelRequestSettings,
    | "requestPathModifierVipTokenCost"
    | "requestPathModifierGuitarVipTokenCost"
    | "requestPathModifierLeadVipTokenCost"
    | "requestPathModifierRhythmVipTokenCost"
    | "requestPathModifierBassVipTokenCost"
  > & {
    allowRequestPathModifiers?: boolean;
    allowedRequestPathsJson?: string | null;
    requestPathModifierUsesVipPriority?: boolean | null;
    requestPathModifierVipTokenCosts?: Partial<Record<string, unknown>> | null;
  };
}) {
  const normalizedSettings = {
    allowRequestPathModifiers:
      input.settings.allowRequestPathModifiers ?? false,
    allowedRequestPathsJson: input.settings.allowedRequestPathsJson ?? null,
    requestPathModifierVipTokenCost:
      input.settings.requestPathModifierVipTokenCost,
    requestPathModifierGuitarVipTokenCost:
      input.settings.requestPathModifierGuitarVipTokenCost ?? null,
    requestPathModifierLeadVipTokenCost:
      input.settings.requestPathModifierLeadVipTokenCost ?? null,
    requestPathModifierRhythmVipTokenCost:
      input.settings.requestPathModifierRhythmVipTokenCost ?? null,
    requestPathModifierBassVipTokenCost:
      input.settings.requestPathModifierBassVipTokenCost ?? null,
    requestPathModifierVipTokenCosts:
      input.settings.requestPathModifierVipTokenCosts ?? null,
    requestPathModifierUsesVipPriority:
      input.settings.requestPathModifierUsesVipPriority,
  };
  const allowedRequestPaths = getAllowedRequestPathsSetting(normalizedSettings);
  const effectiveRequestedPaths = normalizeAllowedRequestPaths(
    input.requestedPaths
  ).filter((path) => allowedRequestPaths.includes(path));
  const requestedPathVipTokenCostDetails =
    getRequiredVipTokenCostDetailsForRequestedPaths({
      requestedPaths: effectiveRequestedPaths,
      settings: normalizedSettings,
    });
  const requestedPathVipTokenCost = getRequiredVipTokenCostForRequestedPaths({
    requestedPaths: effectiveRequestedPaths,
    settings: normalizedSettings,
  });
  const requiredSongVipTokenCost = getRequiredVipTokenCostForSong(
    input.song,
    input.thresholds
  );
  const matchedDurationThreshold = getMatchedVipTokenDurationThresholdForSong(
    input.song,
    input.thresholds
  );
  const pathSelectionUsesVipPriority =
    getRequestPathModifierUsesVipPrioritySetting({
      allowedRequestPaths,
      settings: normalizedSettings,
    });
  const regularRequestRequiresVip = false;
  const normalizedExplicitVipTokenCost =
    input.explicitVipTokenCost != null &&
    Number.isFinite(input.explicitVipTokenCost)
      ? Math.max(1, Math.trunc(input.explicitVipTokenCost))
      : 1;
  const requiredRegularRequestTokenCost =
    requiredSongVipTokenCost + requestedPathVipTokenCost;
  const requiredVipRequestTokenCost = 1 + requiredRegularRequestTokenCost;
  const vipTokenReasons: RequestVipTokenPlanReason[] = [];

  if (input.requestKind === "vip") {
    if (normalizedExplicitVipTokenCost > requiredVipRequestTokenCost) {
      vipTokenReasons.push({
        type: "explicit_vip",
        cost: normalizedExplicitVipTokenCost,
      });
    } else {
      vipTokenReasons.push({
        type: "base_vip",
        cost: 1,
      });
    }
  }

  if (matchedDurationThreshold && requiredSongVipTokenCost > 0) {
    vipTokenReasons.push({
      type: "duration",
      cost: matchedDurationThreshold.tokenCost,
      minimumDurationMinutes: matchedDurationThreshold.minimumDurationMinutes,
    });
  }

  for (const detail of requestedPathVipTokenCostDetails) {
    vipTokenReasons.push({
      type: "requested_path",
      cost: detail.cost,
      path: detail.path,
    });
  }

  if (input.requestKind !== "vip") {
    return {
      effectiveRequestedPaths,
      requestedPathVipTokenCostDetails,
      requestedPathVipTokenCost,
      requiredSongVipTokenCost,
      matchedDurationThreshold,
      pathSelectionUsesVipPriority,
      regularRequestRequiresVip,
      requiredVipRequestTokenCost,
      vipTokenReasons,
      totalVipTokenCost: requiredRegularRequestTokenCost,
    };
  }

  return {
    effectiveRequestedPaths,
    requestedPathVipTokenCostDetails,
    requestedPathVipTokenCost,
    requiredSongVipTokenCost,
    matchedDurationThreshold,
    pathSelectionUsesVipPriority,
    regularRequestRequiresVip,
    requiredVipRequestTokenCost,
    vipTokenReasons,
    totalVipTokenCost: Math.max(
      normalizedExplicitVipTokenCost,
      requiredVipRequestTokenCost
    ),
  };
}
