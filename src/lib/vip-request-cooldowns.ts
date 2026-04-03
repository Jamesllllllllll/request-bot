export type VipRequestCooldownSettings = {
  vipRequestCooldownEnabled?: boolean | null;
  vipRequestCooldownMinutes?: number | null;
};

export type VipRequestCooldownCountdown = {
  unit: "seconds" | "minutes";
  count: number;
};

export function normalizeVipRequestCooldownMinutes(
  value: number | null | undefined
) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value ?? 0));
}

export function isVipRequestCooldownEnabled(
  settings: VipRequestCooldownSettings
) {
  return (
    settings.vipRequestCooldownEnabled === true &&
    normalizeVipRequestCooldownMinutes(settings.vipRequestCooldownMinutes) > 0
  );
}

export function getVipRequestCooldownExpiresAt(input: {
  cooldownMinutes: number;
  cooldownStartedAt?: number;
}) {
  const cooldownMinutes = normalizeVipRequestCooldownMinutes(
    input.cooldownMinutes
  );
  const cooldownStartedAt = input.cooldownStartedAt ?? Date.now();

  return cooldownStartedAt + cooldownMinutes * 60_000;
}

export function getVipRequestCooldownRemainingMs(
  cooldownExpiresAt: number,
  now = Date.now()
) {
  return Math.max(0, cooldownExpiresAt - now);
}

export function getVipRequestCooldownCountdown(
  cooldownExpiresAt: number,
  now = Date.now()
): VipRequestCooldownCountdown | null {
  const remainingMs = getVipRequestCooldownRemainingMs(cooldownExpiresAt, now);

  if (remainingMs <= 0) {
    return null;
  }

  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

  if (remainingSeconds < 60) {
    return {
      unit: "seconds",
      count: remainingSeconds,
    };
  }

  return {
    unit: "minutes",
    count: Math.ceil(remainingSeconds / 60),
  };
}

export function formatVipRequestCooldownCountdown(
  countdown: VipRequestCooldownCountdown
) {
  return `${countdown.count} ${countdown.unit === "seconds" ? `second${countdown.count === 1 ? "" : "s"}` : `minute${countdown.count === 1 ? "" : "s"}`}`;
}
