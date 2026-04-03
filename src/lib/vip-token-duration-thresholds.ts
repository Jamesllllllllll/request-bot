import { normalizeVipTokenCount } from "./vip-tokens";

export type VipTokenDurationThreshold = {
  minimumDurationMinutes: number;
  tokenCost: number;
};

const durationThresholdNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeVipTokenDurationThresholds(
  thresholds: VipTokenDurationThreshold[]
) {
  const normalizedThresholds = thresholds
    .map((threshold) => ({
      minimumDurationMinutes:
        Math.round(Math.max(0, threshold.minimumDurationMinutes) * 100) / 100,
      tokenCost: Math.max(1, Math.trunc(threshold.tokenCost)),
    }))
    .filter(
      (threshold) =>
        Number.isFinite(threshold.minimumDurationMinutes) &&
        Number.isFinite(threshold.tokenCost)
    )
    .sort((left, right) => {
      if (left.minimumDurationMinutes !== right.minimumDurationMinutes) {
        return left.minimumDurationMinutes - right.minimumDurationMinutes;
      }

      return left.tokenCost - right.tokenCost;
    });

  const deduped: VipTokenDurationThreshold[] = [];

  for (const threshold of normalizedThresholds) {
    const previous = deduped[deduped.length - 1];

    if (
      previous &&
      previous.minimumDurationMinutes === threshold.minimumDurationMinutes
    ) {
      previous.tokenCost = Math.max(previous.tokenCost, threshold.tokenCost);
      continue;
    }

    deduped.push({ ...threshold });
  }

  return deduped;
}

export function serializeVipTokenDurationThresholds(
  thresholds: VipTokenDurationThreshold[]
) {
  return JSON.stringify(normalizeVipTokenDurationThresholds(thresholds));
}

export function parseVipTokenDurationThresholds(
  value: string | null | undefined
) {
  try {
    const parsed = JSON.parse(value ?? "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeVipTokenDurationThresholds(
      parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const minimumDurationMinutes = toFiniteNumber(
            "minimumDurationMinutes" in entry
              ? entry.minimumDurationMinutes
              : null
          );
          const tokenCost = toFiniteNumber(
            "tokenCost" in entry ? entry.tokenCost : null
          );

          if (minimumDurationMinutes == null || tokenCost == null) {
            return null;
          }

          return {
            minimumDurationMinutes,
            tokenCost,
          } satisfies VipTokenDurationThreshold;
        })
        .filter((entry): entry is VipTokenDurationThreshold => entry !== null)
    );
  } catch {
    return [];
  }
}

export function parseDurationTextToSeconds(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(":").map((segment) => Number(segment.trim()));
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((segment) => !Number.isInteger(segment) || segment < 0)
  ) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (seconds >= 60) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = parts;
  if (minutes >= 60 || seconds >= 60) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export function getRequiredVipTokenCostForDuration(
  durationSeconds: number | null | undefined,
  thresholds: VipTokenDurationThreshold[]
) {
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return 0;
  }

  let requiredTokenCost = 0;

  for (const threshold of normalizeVipTokenDurationThresholds(thresholds)) {
    if (durationSeconds > threshold.minimumDurationMinutes * 60) {
      requiredTokenCost = Math.max(requiredTokenCost, threshold.tokenCost);
    }
  }

  return requiredTokenCost;
}

export function getRequiredVipTokenCostForSong(
  input:
    | {
        durationSeconds?: number | null;
        durationText?: string | null;
      }
    | null
    | undefined,
  thresholds: VipTokenDurationThreshold[]
) {
  if (!input) {
    return 0;
  }

  const durationSeconds =
    input.durationSeconds ?? parseDurationTextToSeconds(input.durationText);

  return getRequiredVipTokenCostForDuration(durationSeconds, thresholds);
}

export function getEffectiveVipTokenCost(input: {
  requestKind: "regular" | "vip";
  explicitVipTokenCost?: number | null;
  song?: {
    durationSeconds?: number | null;
    durationText?: string | null;
  } | null;
  thresholds: VipTokenDurationThreshold[];
}) {
  if (input.requestKind !== "vip") {
    return 0;
  }

  const normalizedExplicitVipTokenCost =
    input.explicitVipTokenCost != null &&
    Number.isFinite(input.explicitVipTokenCost)
      ? Math.max(1, Math.trunc(input.explicitVipTokenCost))
      : 1;

  return Math.max(
    normalizedExplicitVipTokenCost,
    getRequiredVipTokenCostForSong(input.song, input.thresholds)
  );
}

export function formatVipDurationThresholdMinutes(value: number) {
  return durationThresholdNumberFormatter.format(value);
}

export function formatVipTokenCostLabel(count: number) {
  const normalizedCount = normalizeVipTokenCount(count);
  return normalizedCount === 1
    ? "1 VIP token"
    : `${normalizedCount} VIP tokens`;
}
